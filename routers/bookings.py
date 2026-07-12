from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
import models
import schemas
from routers.auth import get_current_user

router = APIRouter(prefix="", tags=["Resource Bookings"])

@router.get("/bookings", response_model=List[schemas.ResourceBookingResponse])
async def list_bookings(
    asset_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    query = select(models.ResourceBooking)
    if asset_id:
        query = query.where(models.ResourceBooking.asset_id == asset_id)
    if status:
        query = query.where(models.ResourceBooking.status == status)
        
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/bookings", response_model=schemas.ResourceBookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    booking: schemas.ResourceBookingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    # 1. Validate times
    if booking.start_time >= booking.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be before end time"
        )
        
    # 2. Check asset existence
    asset_res = await db.execute(select(models.Asset).where(models.Asset.id == booking.asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )
        
    # 3. Prevent Booking Overlap
    # Rule: start_time < :end_time AND end_time > :start_time
    overlap_query = (
        select(models.ResourceBooking)
        .where(
            models.ResourceBooking.asset_id == booking.asset_id,
            models.ResourceBooking.status.in_(["UPCOMING", "ONGOING"]),
            models.ResourceBooking.start_time < booking.end_time,
            models.ResourceBooking.end_time > booking.start_time
        )
    )
    
    overlap_res = await db.execute(overlap_query)
    overlap = overlap_res.scalar_one_or_none()
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Overlap detected! Asset '{asset.name}' is already reserved between {overlap.start_time} and {overlap.end_time}."
        )
        
    # 4. Create booking
    db_booking = models.ResourceBooking(
        asset_id=booking.asset_id,
        booked_by_id=current_user.id,
        booked_for_department_id=booking.booked_for_department_id or current_user.department_id,
        start_time=booking.start_time,
        end_time=booking.end_time,
        status="UPCOMING",
        purpose=booking.purpose
    )
    
    db.add(db_booking)
    
    # System audit log
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="CREATE_BOOKING",
        entity_name="ResourceBooking",
        entity_id=booking.asset_id, # Logged under target asset
        new_values={"start_time": str(booking.start_time), "end_time": str(booking.end_time)}
    )
    db.add(audit_log)
    
    # Optional: Update asset status if the booking starts immediately
    now = datetime.now(booking.start_time.tzinfo)
    if booking.start_time <= now <= booking.end_time:
        db_booking.status = "ONGOING"
        asset.status = "RESERVED"
        
    await db.commit()
    await db.refresh(db_booking)
    return db_booking


@router.put("/bookings/{id}/cancel", response_model=schemas.ResourceBookingResponse)
async def cancel_booking(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    result = await db.execute(
        select(models.ResourceBooking)
        .options(selectinload(models.ResourceBooking.asset))
        .where(models.ResourceBooking.id == id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
        
    # Authorization: Owner, manager, or admin
    if booking.booked_by_id != current_user.id and current_user.role not in ["ADMIN", "ASSET_MANAGER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to cancel this booking"
        )
        
    if booking.status in ["CANCELLED", "COMPLETED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a booking that is already {booking.status}"
        )
        
    booking.status = "CANCELLED"
    if booking.asset.status == "RESERVED":
        booking.asset.status = "AVAILABLE"
        
    # Audit log
    audit_log = models.SystemAuditLog(
        employee_id=current_user.id,
        action="CANCEL_BOOKING",
        entity_name="ResourceBooking",
        entity_id=id,
        old_values={"status": "UPCOMING"},
        new_values={"status": "CANCELLED"}
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(booking)
    return booking
