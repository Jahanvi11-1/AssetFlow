from datetime import date, datetime
from typing import List, Optional, Any
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ==========================================
# Auth Schemas
# ==========================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    employee_id: Optional[int] = None

# ==========================================
# Department Schemas
# ==========================================

class DepartmentBase(BaseModel):
    name: str
    parent_department_id: Optional[int] = None
    department_head_id: Optional[int] = None
    status: Optional[str] = "ACTIVE"

class DepartmentCreate(BaseModel):
    name: str
    parent_department_id: Optional[int] = None
    department_head_id: Optional[int] = None

class DepartmentResponse(DepartmentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# Employee Schemas
# ==========================================

class EmployeeBase(BaseModel):
    name: str
    email: EmailStr
    department_id: Optional[int] = None
    role: Optional[str] = "EMPLOYEE"
    status: Optional[str] = "ACTIVE"

class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    department_id: Optional[int] = None
    role: Optional[str] = "EMPLOYEE"

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    department_id: Optional[int] = None
    role: Optional[str] = None
    status: Optional[str] = None

class EmployeeResponse(EmployeeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# AssetCategory Schemas
# ==========================================

class AssetCategoryBase(BaseModel):
    name: str
    status: Optional[str] = "ACTIVE"

class AssetCategoryCreate(BaseModel):
    name: str

class AssetCategoryResponse(AssetCategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# Asset Schemas
# ==========================================

class AssetBase(BaseModel):
    asset_tag: str
    name: str
    category_id: int
    serial_number: Optional[str] = None
    acquisition_date: date
    acquisition_cost: Decimal
    condition: str
    location: str
    is_shared: Optional[bool] = False
    status: Optional[str] = "AVAILABLE"
    next_maintenance_due: Optional[date] = None

class AssetCreate(BaseModel):
    asset_tag: str
    name: str
    category_id: int
    serial_number: Optional[str] = None
    acquisition_date: date
    acquisition_cost: Decimal
    condition: str = Field(pattern="^(NEW|GOOD|FAIR|POOR|DAMAGED)$")
    location: str
    is_shared: Optional[bool] = False

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    serial_number: Optional[str] = None
    acquisition_date: Optional[date] = None
    acquisition_cost: Optional[Decimal] = None
    condition: Optional[str] = Field(None, pattern="^(NEW|GOOD|FAIR|POOR|DAMAGED)$")
    location: Optional[str] = None
    is_shared: Optional[bool] = None
    status: Optional[str] = Field(None, pattern="^(AVAILABLE|ALLOCATED|RESERVED|UNDER_MAINTENANCE|LOST|RETIRED|DISPOSED)$")
    next_maintenance_due: Optional[date] = None

class AssetResponse(AssetBase):
    id: int
    created_at: datetime
    updated_at: datetime
    assigned_employee_id: Optional[int] = None
    assigned_department_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# AssetAllocation Schemas
# ==========================================

class AssetAllocationBase(BaseModel):
    asset_id: int
    employee_id: int
    allocated_by_id: int
    allocation_date: date
    expected_return_date: Optional[date] = None
    actual_return_date: Optional[date] = None
    checkout_condition: str
    checkin_condition: Optional[str] = None
    checkin_notes: Optional[str] = None
    status: Optional[str] = "ACTIVE"

class AssetAllocationCreate(BaseModel):
    employee_id: int
    expected_return_date: Optional[date] = None
    checkout_condition: str = Field(pattern="^(NEW|GOOD|FAIR|POOR|DAMAGED)$")

class AssetAllocationReturn(BaseModel):
    checkin_condition: str = Field(pattern="^(NEW|GOOD|FAIR|POOR|DAMAGED)$")
    checkin_notes: Optional[str] = None

class AssetAllocationResponse(AssetAllocationBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# TransferRequest Schemas
# ==========================================

class TransferRequestBase(BaseModel):
    asset_id: int
    from_employee_id: int
    to_employee_id: int
    requested_by_id: int
    request_date: datetime
    status: Optional[str] = "PENDING"
    actioned_by_id: Optional[int] = None
    actioned_date: Optional[datetime] = None
    remarks: Optional[str] = None

class TransferRequestCreate(BaseModel):
    asset_id: int
    to_employee_id: int
    remarks: Optional[str] = None

class TransferRequestAction(BaseModel):
    status: str = Field(pattern="^(APPROVED|REJECTED)$")
    remarks: Optional[str] = None

class TransferRequestResponse(TransferRequestBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# ResourceBooking Schemas
# ==========================================

class ResourceBookingBase(BaseModel):
    asset_id: int
    booked_by_id: int
    booked_for_department_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    status: Optional[str] = "UPCOMING"
    purpose: Optional[str] = None

class ResourceBookingCreate(BaseModel):
    asset_id: int
    booked_for_department_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    purpose: Optional[str] = None

class ResourceBookingResponse(ResourceBookingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# MaintenanceRequest Schemas
# ==========================================

class MaintenanceRequestBase(BaseModel):
    asset_id: int
    raised_by_id: int
    issue_description: str
    priority: str
    photo_url: Optional[str] = None
    status: Optional[str] = "PENDING"
    actioned_by_id: Optional[int] = None
    actioned_date: Optional[datetime] = None
    technician_name: Optional[str] = None
    technician_notes: Optional[str] = None
    cost: Optional[Decimal] = None
    resolved_at: Optional[datetime] = None

class MaintenanceRequestCreate(BaseModel):
    asset_id: int
    issue_description: str
    priority: str = Field(pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    photo_url: Optional[str] = None

class MaintenanceRequestAction(BaseModel):
    status: str = Field(pattern="^(APPROVED|TECHNICIAN_ASSIGNED|IN_PROGRESS|RESOLVED)$")
    technician_name: Optional[str] = None
    technician_notes: Optional[str] = None
    cost: Optional[Decimal] = None

class MaintenanceRequestResponse(MaintenanceRequestBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# AuditCycle Schemas
# ==========================================

class AuditCycleBase(BaseModel):
    title: str
    scope_department_id: Optional[int] = None
    scope_location: Optional[str] = None
    start_date: date
    end_date: date
    status: Optional[str] = "PLANNED"
    created_by_id: int

class AuditCycleCreate(BaseModel):
    title: str
    scope_department_id: Optional[int] = None
    scope_location: Optional[str] = None
    start_date: date
    end_date: date
    auditor_ids: List[int]

class AuditCycleResponse(AuditCycleBase):
    id: int
    created_at: datetime
    updated_at: datetime
    auditors: Optional[List[EmployeeResponse]] = None

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# AuditItem Schemas
# ==========================================

class AuditItemBase(BaseModel):
    audit_cycle_id: int
    asset_id: int
    auditor_id: Optional[int] = None
    verification_status: Optional[str] = "UNVERIFIED"
    notes: Optional[str] = None
    verified_at: Optional[datetime] = None

class AuditItemUpdate(BaseModel):
    verification_status: str = Field(pattern="^(UNVERIFIED|VERIFIED|MISSING|DAMAGED)$")
    notes: Optional[str] = None

class AuditItemResponse(AuditItemBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# Notification & Log Schemas
# ==========================================

class NotificationResponse(BaseModel):
    id: int
    recipient_id: int
    title: str
    message: str
    type: str
    is_read: bool
    reference_table: Optional[str] = None
    reference_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserNotificationLogResponse(BaseModel):
    id: int
    timestamp: datetime
    type: str
    title: str
    message: str
    is_read: bool
    reference_table: Optional[str] = None
    reference_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class SystemAuditLogResponse(BaseModel):
    id: int
    employee_id: Optional[int] = None
    action: str
    entity_name: str
    entity_id: int
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# Dashboard & Reports Schemas
# ==========================================

class KPIMetrics(BaseModel):
    available_assets: int
    allocated_assets: int
    maintenance_today: int
    active_bookings: int
    pending_transfers: int
    upcoming_returns: int

class RecentActivityItem(BaseModel):
    id: int
    timestamp: datetime
    type: str  # 'ALLOCATION', 'MAINTENANCE', 'BOOKING', 'TRANSFER', 'AUDIT'
    title: str
    message: str
    entity_id: int

class DashboardOverviewResponse(BaseModel):
    kpis: KPIMetrics
    recent_activities: List[RecentActivityItem]

class CategoryUtilization(BaseModel):
    category_name: str
    allocated_count: int
    total_count: int
    utilization_rate: float

class LocationHeatmapItem(BaseModel):
    location: str
    asset_count: int
    value_sum: Decimal
