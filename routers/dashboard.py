from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
import models
import schemas
from routers.auth import get_current_user, verify_manager_or_admin

router = APIRouter(prefix="", tags=["Dashboard & Analytics"])

@router.get("/dashboard/overview", response_model=schemas.DashboardOverviewResponse)
async def get_dashboard_overview(
    db: AsyncSession = Depends(get_db), 
    current_user: models.Employee = Depends(get_current_user)
):
    # 1. Gather KPIs
    # Available assets
    avail_res = await db.execute(
        select(func.count(models.Asset.id)).where(models.Asset.status == "AVAILABLE")
    )
    avail_count = avail_res.scalar() or 0
    
    # Allocated assets
    alloc_res = await db.execute(
        select(func.count(models.Asset.id)).where(models.Asset.status == "ALLOCATED")
    )
    alloc_count = alloc_res.scalar() or 0
    
    # Maintenance today (ongoing active requests)
    maint_res = await db.execute(
        select(func.count(models.MaintenanceRequest.id)).where(
            models.MaintenanceRequest.status.in_(["PENDING", "APPROVED", "TECHNICIAN_ASSIGNED", "IN_PROGRESS"])
        )
    )
    maint_count = maint_res.scalar() or 0
    
    # Active bookings
    bookings_res = await db.execute(
        select(func.count(models.ResourceBooking.id)).where(models.ResourceBooking.status == "ONGOING")
    )
    bookings_count = bookings_res.scalar() or 0
    
    # Pending transfers
    trans_res = await db.execute(
        select(func.count(models.TransferRequest.id)).where(models.TransferRequest.status == "PENDING")
    )
    trans_count = trans_res.scalar() or 0
    
    # Upcoming returns (Active allocations return date in next 7 days)
    today = date.today()
    next_week = today + timedelta(days=7)
    returns_res = await db.execute(
        select(func.count(models.AssetAllocation.id)).where(
            models.AssetAllocation.status == "ACTIVE",
            models.AssetAllocation.expected_return_date >= today,
            models.AssetAllocation.expected_return_date <= next_week
        )
    )
    returns_count = returns_res.scalar() or 0
    
    kpis = schemas.KPIMetrics(
        available_assets=avail_count,
        allocated_assets=alloc_count,
        maintenance_today=maint_count,
        active_bookings=bookings_count,
        pending_transfers=trans_count,
        upcoming_returns=returns_count
    )
    
    # 2. Recent Activities (from system audit logs)
    logs_res = await db.execute(
        select(models.SystemAuditLog)
        .order_by(models.SystemAuditLog.created_at.desc())
        .limit(10)
    )
    logs = logs_res.scalars().all()
    
    recent_activities = []
    for log in logs:
        # Format a nice readable message
        msg = f"Action '{log.action}' performed on entity '{log.entity_name}' (ID: {log.entity_id})."
        recent_activities.append(
            schemas.RecentActivityItem(
                id=log.id,
                timestamp=log.created_at,
                type=log.action,
                title=log.action.replace("_", " ").title(),
                message=msg,
                entity_id=log.entity_id
            )
        )
        
    return schemas.DashboardOverviewResponse(
        kpis=kpis,
        recent_activities=recent_activities
    )

# ==========================================
# Screen 10: Reports & Analytics (Managers Only)
# ==========================================

@router.get("/reports/category-utilization", response_model=List[schemas.CategoryUtilization])
async def get_category_utilization(
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    query = (
        select(
            models.AssetCategory.name,
            func.count(models.Asset.id).label("total"),
            func.count(func.nullif(models.Asset.status != "ALLOCATED", True)).label("allocated")
        )
        .join(models.Asset, models.Asset.category_id == models.AssetCategory.id, isouter=True)
        .group_by(models.AssetCategory.name)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    utilization_list = []
    for row in rows:
        category_name, total_count, allocated_count = row
        total_count = total_count or 0
        allocated_count = allocated_count or 0
        util_rate = (allocated_count / total_count * 100.0) if total_count > 0 else 0.0
        utilization_list.append(
            schemas.CategoryUtilization(
                category_name=category_name,
                allocated_count=allocated_count,
                total_count=total_count,
                utilization_rate=round(util_rate, 2)
            )
        )
        
    return utilization_list


@router.get("/reports/location-heatmap", response_model=List[schemas.LocationHeatmapItem])
async def get_location_heatmap(
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    query = (
        select(
            models.Asset.location,
            func.count(models.Asset.id).label("count"),
            func.sum(models.Asset.acquisition_cost).label("value")
        )
        .group_by(models.Asset.location)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    heatmap = []
    for row in rows:
        loc, count, val = row
        heatmap.append(
            schemas.LocationHeatmapItem(
                location=loc or "UNKNOWN",
                asset_count=count or 0,
                value_sum=val or 0.00
            )
        )
        
    return heatmap

# ==========================================
# Screen 9: Audit Trail logs
# ==========================================

@router.get("/reports/audit-logs", response_model=List[schemas.SystemAuditLogResponse])
async def list_system_audit_logs(
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    verify_manager_or_admin(current_user)
    
    result = await db.execute(
        select(models.SystemAuditLog).order_by(models.SystemAuditLog.created_at.desc())
    )
    return result.scalars().all()


@router.get("/dashboard/logs", response_model=List[schemas.UserNotificationLogResponse])
async def get_user_notifications(
    mark_read: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: models.Employee = Depends(get_current_user)
):
    # Fetch notifications for the logged in user
    query = select(models.Notification).where(
        models.Notification.recipient_id == current_user.id
    ).order_by(models.Notification.created_at.desc())
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    # If mark_read is true, mark all unread notifications for this user as read
    if mark_read:
        for n in notifications:
            if not n.is_read:
                n.is_read = True
        await db.commit()
        
    return [
        schemas.UserNotificationLogResponse(
            id=n.id,
            timestamp=n.created_at,
            type=n.type,
            title=n.title,
            message=n.message,
            is_read=n.is_read,
            reference_table=n.reference_table,
            reference_id=n.reference_id
        ) for n in notifications
    ]

