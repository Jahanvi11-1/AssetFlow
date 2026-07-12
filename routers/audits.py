from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import insert, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
import models
import schemas
from routers.auth import get_current_user, verify_manager_or_admin

router = APIRouter(prefix="", tags=["Asset Audits & Stocktakes"])

@router.get("/audits/cycles", response_model=List[schemas.AuditCycleResponse])
async def list_audit_cycles(db: AsyncSession = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    result = await db.execute(
        select(models.AuditCycle).options(selectinload(models.AuditCycle.auditors))
    )
    return result.scalars().all()


@router.post("/audits/cycles", response_model=schemas.AuditCycleResponse, status_code=status.HTTP_201_CREATED)
async def create_audit_cycle(
    cycle: schemas.AuditCycleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    # 1. Verify and retrieve auditors first to avoid lazy loading
    auditor_list = []
    for aud_id in cycle.auditor_ids:
        aud_res = await db.execute(select(models.Employee).where(models.Employee.id == aud_id))
        auditor = aud_res.scalar_one_or_none()
        if not auditor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Auditor employee ID {aud_id} does not exist"
            )
        auditor_list.append(auditor)
        
    # 2. Create the AuditCycle
    db_cycle = models.AuditCycle(
        title=cycle.title,
        scope_department_id=cycle.scope_department_id,
        scope_location=cycle.scope_location,
        start_date=cycle.start_date,
        end_date=cycle.end_date,
        status="PLANNED",
        created_by_id=current_user.id,
        auditors=auditor_list
    )
    db.add(db_cycle)
    await db.flush()  # Get db_cycle.id
    
    # 3. Scope Assets and Auto-populate Audit Items
    query = select(models.Asset)
    
    # Scoping by location
    if cycle.scope_location:
        query = query.where(models.Asset.location == cycle.scope_location)
        
    # Scoping by department
    if cycle.scope_department_id:
        query = query.join(models.AssetAllocation).join(models.Employee).where(
            models.AssetAllocation.status == "ACTIVE",
            models.Employee.department_id == cycle.scope_department_id
        )
        
    assets_res = await db.execute(query)
    scoped_assets = assets_res.scalars().all()
    
    for asset in scoped_assets:
        audit_item = models.AuditItem(
            audit_cycle_id=db_cycle.id,
            asset_id=asset.id,
            verification_status="UNVERIFIED"
        )
        db.add(audit_item)
        
    await db.commit()
    
    # Fetch final object with relationships loaded
    final_res = await db.execute(
        select(models.AuditCycle)
        .options(selectinload(models.AuditCycle.auditors))
        .where(models.AuditCycle.id == db_cycle.id)
    )
    return final_res.scalar_one()


@router.put("/audits/cycles/{id}/status", response_model=schemas.AuditCycleResponse)
async def update_cycle_status(
    id: int,
    status_val: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    if status_val not in ["PLANNED", "IN_PROGRESS", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status value"
        )
        
    result = await db.execute(
        select(models.AuditCycle)
        .options(selectinload(models.AuditCycle.auditors))
        .where(models.AuditCycle.id == id)
    )
    cycle = result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit cycle not found"
        )
        
    if cycle.status == "CLOSED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed audit cycles cannot be modified"
        )
        
    cycle.status = status_val
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(models.AuditCycle)
        .options(selectinload(models.AuditCycle.auditors))
        .where(models.AuditCycle.id == id)
    )
    return result.scalar_one()


@router.get("/audits/cycles/{id}/items", response_model=List[schemas.AuditItemResponse])
async def list_audit_items(
    id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.Employee = Depends(get_current_user)
):
    result = await db.execute(
        select(models.AuditItem).where(models.AuditItem.audit_cycle_id == id)
    )
    return result.scalars().all()


@router.put("/audits/items/{item_id}", response_model=schemas.AuditItemResponse)
async def verify_audit_item(
    item_id: int,
    update: schemas.AuditItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    # Verify employee is an auditor or admin
    item_res = await db.execute(
        select(models.AuditItem)
        .options(selectinload(models.AuditItem.cycle))
        .where(models.AuditItem.id == item_id)
    )
    item = item_res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit item not found"
        )
        
    if item.cycle.status != "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification can only be performed when the audit cycle is IN_PROGRESS"
        )
        
    # Apply verification
    item.verification_status = update.verification_status
    item.notes = update.notes
    item.auditor_id = current_user.id
    item.verified_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/audits/cycles/{id}/close", response_model=schemas.AuditCycleResponse)
async def close_audit_cycle(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    res = await db.execute(
        select(models.AuditCycle)
        .options(selectinload(models.AuditCycle.auditors))
        .where(models.AuditCycle.id == id)
    )
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit cycle not found"
        )
        
    if cycle.status == "CLOSED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audit cycle is already closed"
        )
        
    # 1. Update cycle status
    cycle.status = "CLOSED"
    
    # 2. Audit Closing Routine: automatically transition MISSING assets to LOST in the registry
    missing_items_res = await db.execute(
        select(models.AuditItem)
        .options(selectinload(models.AuditItem.asset))
        .where(models.AuditItem.audit_cycle_id == id, models.AuditItem.verification_status == "MISSING")
    )
    missing_items = missing_items_res.scalars().all()
    
    for item in missing_items:
        # Update asset status to LOST
        item.asset.status = "LOST"
        
        # Log audit event for asset status change
        audit_log = models.SystemAuditLog(
            employee_id=current_user.id,
            action="AUDIT_CLOSE_LOST_ASSET",
            entity_name="Asset",
            entity_id=item.asset_id,
            old_values={"status": "AVAILABLE/ALLOCATED"},
            new_values={"status": "LOST"}
        )
        db.add(audit_log)
        
    # Audit log for closing cycle
    cycle_audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="CLOSE_AUDIT_CYCLE",
        entity_name="AuditCycle",
        entity_id=id,
        new_values={"status": "CLOSED", "missing_assets_lost_count": len(missing_items)}
    )
    db.add(cycle_audit_log)
    
    await db.commit()
    
    # Reload with relationships
    res = await db.execute(
        select(models.AuditCycle)
        .options(selectinload(models.AuditCycle.auditors))
        .where(models.AuditCycle.id == id)
    )
    return res.scalar_one()
