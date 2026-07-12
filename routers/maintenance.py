from datetime import datetime, date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
import models
import schemas
from routers.auth import get_current_user, verify_manager_or_admin

router = APIRouter(prefix="", tags=["Maintenance Workflow"])

@router.get("/maintenance", response_model=List[schemas.MaintenanceRequestResponse])
async def list_maintenance(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    query = select(models.MaintenanceRequest)
    if status:
        query = query.where(models.MaintenanceRequest.status == status)
    if priority:
        query = query.where(models.MaintenanceRequest.priority == priority)
        
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/maintenance", response_model=schemas.MaintenanceRequestResponse, status_code=status.HTTP_201_CREATED)
async def raise_maintenance_request(
    req: schemas.MaintenanceRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    # Check asset existence
    asset_res = await db.execute(select(models.Asset).where(models.Asset.id == req.asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
        
    # Create request
    db_req = models.MaintenanceRequest(
        asset_id=req.asset_id,
        raised_by_id=current_user.id,
        issue_description=req.issue_description,
        priority=req.priority,
        photo_url=req.photo_url,
        status="PENDING"
    )
    
    # Trigger asset status change
    asset.status = "UNDER_MAINTENANCE"
    
    db.add(db_req)
    
    # Notify managers about new maintenance
    # Let's search for asset managers / admins to notify or simply create notifications for them
    managers_res = await db.execute(
        select(models.Employee).where(models.Employee.role.in_(["ADMIN", "ASSET_MANAGER"]))
    )
    managers = managers_res.scalars().all()
    for mgr in managers:
        notification = models.Notification(
            recipient_id=mgr.id,
            title="New Maintenance Request",
            message=f"Maintenance raised for '{asset.name}' (Priority: {req.priority}).",
            type="MAINTENANCE"
        )
        db.add(notification)
        
    # Audit log
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="RAISE_MAINTENANCE",
        entity_name="MaintenanceRequest",
        entity_id=req.asset_id,
        new_values={"priority": req.priority, "issue_description": req.issue_description}
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(db_req)
    return db_req


@router.put("/maintenance/{id}/status", response_model=schemas.MaintenanceRequestResponse)
async def transition_maintenance_status(
    id: int,
    action: schemas.MaintenanceRequestAction,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    # Fetch request
    res = await db.execute(
        select(models.MaintenanceRequest)
        .options(selectinload(models.MaintenanceRequest.asset))
        .where(models.MaintenanceRequest.id == id)
    )
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance request not found"
        )
        
    old_status = req.status
    target_status = action.status
    
    # Validate Kanban Flow transitions: PENDING -> APPROVED -> TECHNICIAN_ASSIGNED -> IN_PROGRESS -> RESOLVED
    valid_transitions = {
        "PENDING": ["APPROVED", "RESOLVED"],
        "APPROVED": ["TECHNICIAN_ASSIGNED", "RESOLVED"],
        "TECHNICIAN_ASSIGNED": ["IN_PROGRESS", "RESOLVED"],
        "IN_PROGRESS": ["RESOLVED"],
        "RESOLVED": []
    }
    
    if target_status not in valid_transitions[old_status] and target_status != old_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition from {old_status} to {target_status}"
        )
        
    # Action specific validations
    if target_status == "TECHNICIAN_ASSIGNED" and not action.technician_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Technician name is required for TECHNICIAN_ASSIGNED status"
        )
        
    if target_status == "RESOLVED":
        if action.cost is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cost is required to resolve a maintenance request"
            )
            
    # Apply updates
    req.status = target_status
    req.actioned_by_id = current_user.id
    req.actioned_date = datetime.utcnow()
    
    if action.technician_name:
        req.technician_name = action.technician_name
    if action.technician_notes:
        req.technician_notes = action.technician_notes
    if action.cost is not None:
        req.cost = action.cost
        
    if target_status == "RESOLVED":
        req.resolved_at = datetime.utcnow()
        # Restore asset to AVAILABLE
        req.asset.status = "AVAILABLE"
        # Update next maintenance date to 6 months from now by default
        req.asset.next_maintenance_due = date.today() + timedelta(days=180)
        
    # Notify the user who raised the request
    notification = models.Notification(
        recipient_id=req.raised_by_id,
        title="Maintenance Request Update",
        message=f"Your maintenance request for '{req.asset.name}' has transitioned to {target_status}.",
        type="MAINTENANCE",
        reference_table="maintenance_requests",
        reference_id=id
    )
    db.add(notification)
    
    # Audit log
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="TRANSITION_MAINTENANCE",
        entity_name="MaintenanceRequest",
        entity_id=id,
        old_values={"status": old_status},
        new_values={"status": target_status, "cost": str(action.cost) if action.cost else None}
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(req)
    return req
