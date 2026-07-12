from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
import models
import schemas
from routers.auth import get_current_user

router = APIRouter(prefix="", tags=["Asset Registry & Allocations"])

# Helper to check permissions
def verify_manager_or_admin(user: models.Employee):
    if user.role not in ["ADMIN", "ASSET_MANAGER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation restricted to ADMIN or ASSET_MANAGER roles"
        )

# ==========================================
# Asset Categories
# ==========================================

@router.get("/categories", response_model=List[schemas.AssetCategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    result = await db.execute(select(models.AssetCategory))
    return result.scalars().all()


@router.post("/categories", response_model=schemas.AssetCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category: schemas.AssetCategoryCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    # Check duplicate
    dup = await db.execute(
        select(models.AssetCategory).where(models.AssetCategory.name == category.name)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category name already exists"
        )
        
    db_category = models.AssetCategory(name=category.name, status="ACTIVE")
    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    return db_category

# ==========================================
# Asset Registry
# ==========================================

@router.get("/assets", response_model=List[schemas.AssetResponse])
async def list_assets(
    q: Optional[str] = Query(None, description="Search term for tag, serial number, or name"),
    category_id: Optional[int] = None,
    location: Optional[str] = None,
    condition: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    # Utilize indexes through filters
    query = select(models.Asset).options(
        selectinload(models.Asset.allocations).selectinload(models.AssetAllocation.employee)
    )
    
    if q:
        query = query.where(
            models.Asset.asset_tag.ilike(f"%{q}%") |
            models.Asset.serial_number.ilike(f"%{q}%") |
            models.Asset.name.ilike(f"%{q}%")
        )
    if category_id:
        query = query.where(models.Asset.category_id == category_id)
    if location:
        query = query.where(models.Asset.location == location)
    if condition:
        query = query.where(models.Asset.condition == condition)
    if status:
        query = query.where(models.Asset.status == status)
        
    result = await db.execute(query)
    assets = result.scalars().all()
    
    for asset in assets:
        active_alloc = next((a for a in asset.allocations if a.status == "ACTIVE"), None)
        if active_alloc:
            asset.assigned_employee_id = active_alloc.employee_id
            asset.assigned_department_id = active_alloc.employee.department_id if active_alloc.employee else None
        else:
            asset.assigned_employee_id = None
            asset.assigned_department_id = None
            
    return assets


@router.post("/assets", response_model=schemas.AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(
    asset: schemas.AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    # Check duplicate tag
    dup = await db.execute(
        select(models.Asset).where(models.Asset.asset_tag == asset.asset_tag)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset tag already exists"
        )
        
    # Check category
    cat = await db.execute(
        select(models.AssetCategory).where(models.AssetCategory.id == asset.category_id)
    )
    if not cat.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    db_asset = models.Asset(
        asset_tag=asset.asset_tag,
        name=asset.name,
        category_id=asset.category_id,
        serial_number=asset.serial_number,
        acquisition_date=asset.acquisition_date,
        acquisition_cost=asset.acquisition_cost,
        condition=asset.condition,
        location=asset.location,
        is_shared=asset.is_shared,
        status="AVAILABLE"
    )
    db.add(db_asset)
    await db.commit()
    await db.refresh(db_asset)
    
    # Log audit event
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="CREATE_ASSET",
        entity_name="Asset",
        entity_id=db_asset.id,
        new_values=schemas.AssetResponse.model_validate(db_asset).model_dump(mode="json")
    )
    db.add(audit_log)
    await db.commit()
    
    return db_asset


@router.get("/assets/{id}", response_model=schemas.AssetResponse)
async def get_asset(id: int, db: AsyncSession = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    result = await db.execute(
        select(models.Asset)
        .options(selectinload(models.Asset.allocations).selectinload(models.AssetAllocation.employee))
        .where(models.Asset.id == id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    active_alloc = next((a for a in asset.allocations if a.status == "ACTIVE"), None)
    if active_alloc:
        asset.assigned_employee_id = active_alloc.employee_id
        asset.assigned_department_id = active_alloc.employee.department_id if active_alloc.employee else None
    else:
        asset.assigned_employee_id = None
        asset.assigned_department_id = None
        
    return asset


@router.put("/assets/{id}", response_model=schemas.AssetResponse)
async def update_asset(
    id: int, 
    asset_update: schemas.AssetUpdate, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    result = await db.execute(select(models.Asset).where(models.Asset.id == id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
    
    old_values = schemas.AssetResponse.model_validate(asset).model_dump(mode="json")
    
    # Apply updates
    update_data = asset_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(asset, field, value)
        
    await db.commit()
    await db.refresh(asset)
    
    new_values = schemas.AssetResponse.model_validate(asset).model_dump(mode="json")
    
    # Log audit event
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="UPDATE_ASSET",
        entity_name="Asset",
        entity_id=asset.id,
        old_values=old_values,
        new_values=new_values
    )
    db.add(audit_log)
    await db.commit()
    
    return asset

# ==========================================
# Asset Allocations (Prevent Double Allocation)
# ==========================================

@router.post("/assets/{id}/allocate", response_model=schemas.AssetAllocationResponse)
async def allocate_asset(
    id: int,
    alloc: schemas.AssetAllocationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    # Fetch asset
    asset_res = await db.execute(select(models.Asset).where(models.Asset.id == id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
        
    # Check if target employee exists
    emp_res = await db.execute(select(models.Employee).where(models.Employee.id == alloc.employee_id))
    target_emp = emp_res.scalar_one_or_none()
    if not target_emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target employee not found"
        )
        
    # Enforce check: only ONE active allocation per asset
    active_alloc_res = await db.execute(
        select(models.AssetAllocation)
        .options(selectinload(models.AssetAllocation.employee))
        .where(models.AssetAllocation.asset_id == id, models.AssetAllocation.status == "ACTIVE")
    )
    active_alloc = active_alloc_res.scalar_one_or_none()
    
    if active_alloc:
        holder_name = active_alloc.employee.name
        # Double allocation blocked, return active holder name and suggestion
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Double allocation blocked! Asset is currently held by '{holder_name}'. Please request a transfer instead."
        )
        
    # Proceed with allocation
    db_alloc = models.AssetAllocation(
        asset_id=id,
        employee_id=alloc.employee_id,
        allocated_by_id=current_user.id,
        allocation_date=date.today(),
        expected_return_date=alloc.expected_return_date,
        checkout_condition=alloc.checkout_condition,
        status="ACTIVE"
    )
    asset.status = "ALLOCATED"
    
    db.add(db_alloc)
    
    # Add notification for the recipient
    notification = models.Notification(
        recipient_id=alloc.employee_id,
        title="Asset Allocated",
        message=f"Asset '{asset.name}' has been checked out to you.",
        type="ALLOCATION",
        reference_table="asset_allocations"
    )
    db.add(notification)
    
    # System audit log
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="ALLOCATE_ASSET",
        entity_name="AssetAllocation",
        entity_id=id,
        new_values={"employee_id": alloc.employee_id, "checkout_condition": alloc.checkout_condition}
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(db_alloc)
    return db_alloc


@router.post("/assets/{id}/return", response_model=schemas.AssetAllocationResponse)
async def return_asset(
    id: int,
    ret: schemas.AssetAllocationReturn,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    # Fetch active allocation
    active_alloc_res = await db.execute(
        select(models.AssetAllocation)
        .where(models.AssetAllocation.asset_id == id, models.AssetAllocation.status == "ACTIVE")
    )
    active_alloc = active_alloc_res.scalar_one_or_none()
    if not active_alloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active allocation found for this asset"
        )
        
    # Update allocation
    active_alloc.status = "RETURNED"
    active_alloc.actual_return_date = date.today()
    active_alloc.checkin_condition = ret.checkin_condition
    active_alloc.checkin_notes = ret.checkin_notes
    
    # Update asset status
    asset_res = await db.execute(select(models.Asset).where(models.Asset.id == id))
    asset = asset_res.scalar_one_or_none()
    if asset:
        asset.status = "AVAILABLE"
        asset.condition = ret.checkin_condition
        
    # Notification
    notification = models.Notification(
        recipient_id=active_alloc.employee_id,
        title="Asset Returned",
        message=f"Asset '{asset.name}' has been successfully returned.",
        type="ALLOCATION",
        reference_table="asset_allocations",
        reference_id=active_alloc.id
    )
    db.add(notification)
    
    # System audit log
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="RETURN_ASSET",
        entity_name="AssetAllocation",
        entity_id=active_alloc.id,
        old_values={"status": "ACTIVE"},
        new_values={"status": "RETURNED", "checkin_condition": ret.checkin_condition}
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(active_alloc)
    return active_alloc

# ==========================================
# Transfer Requests
# ==========================================

@router.get("/transfers", response_model=List[schemas.TransferRequestResponse])
async def list_transfers(db: AsyncSession = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    result = await db.execute(select(models.TransferRequest))
    return result.scalars().all()


@router.post("/transfers", response_model=schemas.TransferRequestResponse, status_code=status.HTTP_201_CREATED)
async def request_transfer(
    req: schemas.TransferRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    # Enforce Raj must request an asset Priya holds
    # 1. Verify who currently holds the asset
    active_alloc_res = await db.execute(
        select(models.AssetAllocation).where(models.AssetAllocation.asset_id == req.asset_id, models.AssetAllocation.status == "ACTIVE")
    )
    active_alloc = active_alloc_res.scalar_one_or_none()
    if not active_alloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This asset is not currently allocated. You can check it out directly."
        )
        
    if active_alloc.employee_id == req.to_employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The target employee already holds this asset."
        )

    db_req = models.TransferRequest(
        asset_id=req.asset_id,
        from_employee_id=active_alloc.employee_id,
        to_employee_id=req.to_employee_id,
        requested_by_id=current_user.id,
        remarks=req.remarks,
        status="PENDING"
    )
    
    db.add(db_req)
    
    # Send notification to the current holder (from_employee)
    notification = models.Notification(
        recipient_id=active_alloc.employee_id,
        title="Asset Transfer Request",
        message=f"A request has been made to transfer your allocated asset to another employee.",
        type="TRANSFER",
        reference_table="transfer_requests"
    )
    db.add(notification)
    
    await db.commit()
    await db.refresh(db_req)
    return db_req


@router.put("/transfers/{id}/action", response_model=schemas.TransferRequestResponse)
async def action_transfer(
    id: int,
    action: schemas.TransferRequestAction,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    # Fetch request
    req_res = await db.execute(
        select(models.TransferRequest)
        .options(selectinload(models.TransferRequest.asset))
        .where(models.TransferRequest.id == id)
    )
    req = req_res.scalar_one_or_none()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transfer request not found"
        )
        
    if req.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfer request has already been actioned"
        )
        
    # Check authorization: only current holder, admin, or manager can action
    if current_user.id != req.from_employee_id and current_user.role not in ["ADMIN", "ASSET_MANAGER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to action this transfer request"
        )
        
    # Update request
    req.status = action.status
    req.actioned_by_id = current_user.id
    req.actioned_date = datetime.utcnow()
    req.remarks = action.remarks
    
    if action.status == "APPROVED":
        # 1. Close current allocation
        active_alloc_res = await db.execute(
            select(models.AssetAllocation).where(
                models.AssetAllocation.asset_id == req.asset_id,
                models.AssetAllocation.status == "ACTIVE"
            )
        )
        active_alloc = active_alloc_res.scalar_one_or_none()
        if active_alloc:
            active_alloc.status = "TRANSFERRED"
            active_alloc.actual_return_date = date.today()
            active_alloc.checkin_notes = f"Transferred to employee ID {req.to_employee_id} via transfer request {id}"
            
        # 2. Create new allocation
        new_alloc = models.AssetAllocation(
            asset_id=req.asset_id,
            employee_id=req.to_employee_id,
            allocated_by_id=current_user.id,
            allocation_date=date.today(),
            checkout_condition=active_alloc.checkout_condition if active_alloc else "GOOD",
            status="ACTIVE"
        )
        db.add(new_alloc)
        
        # Notify recipient
        notification_to = models.Notification(
            recipient_id=req.to_employee_id,
            title="Transfer Approved",
            message=f"The transfer of asset '{req.asset.name}' to you has been approved.",
            type="TRANSFER",
            reference_table="asset_allocations"
        )
        db.add(notification_to)
        
    elif action.status == "REJECTED":
        # Notify requester
        notification_req = models.Notification(
            recipient_id=req.requested_by_id,
            title="Transfer Rejected",
            message=f"The transfer request for asset '{req.asset.name}' was rejected.",
            type="TRANSFER",
            reference_table="transfer_requests",
            reference_id=id
        )
        db.add(notification_req)
        
    # Audit log
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="ACTION_TRANSFER",
        entity_name="TransferRequest",
        entity_id=id,
        new_values={"status": action.status, "remarks": action.remarks}
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(req)
    return req
