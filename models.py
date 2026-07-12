from __future__ import annotations
from datetime import date, datetime
from typing import List, Optional
from decimal import Decimal
from sqlalchemy import (
    String, BigInteger, Boolean, Date, DateTime, Text, Numeric, JSON,
    ForeignKey, CheckConstraint, Index, UniqueConstraint, func, text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

# ==========================================
# 1. Core Organization & Directory
# ==========================================

class Department(Base):
    __tablename__ = "departments"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    parent_department_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    department_head_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("employees.id", name="fk_departments_head", ondelete="SET NULL", use_alter=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'INACTIVE')", name="chk_departments_status"),
    )

    # Relationships
    parent_department: Mapped[Optional[Department]] = relationship("Department", remote_side=[id])
    head: Mapped[Optional[Employee]] = relationship("Employee", foreign_keys=[department_head_id], post_update=True)
    employees: Mapped[List[Employee]] = relationship("Employee", foreign_keys="Employee.department_id", back_populates="department")


class Employee(Base):
    __tablename__ = "employees"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="EMPLOYEE")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE')", name="chk_employees_role"),
        CheckConstraint("status IN ('ACTIVE', 'INACTIVE')", name="chk_employees_status"),
    )

    # Relationships
    department: Mapped[Optional[Department]] = relationship("Department", foreign_keys=[department_id], back_populates="employees")


# ==========================================
# 2. Asset Registry
# ==========================================

class AssetCategory(Base):
    __tablename__ = "asset_categories"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'INACTIVE')", name="chk_categories_status"),
    )

    # Relationships
    assets: Mapped[List[Asset]] = relationship("Asset", back_populates="category")


class Asset(Base):
    __tablename__ = "assets"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_tag: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("asset_categories.id", ondelete="RESTRICT"), nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    acquisition_date: Mapped[date] = mapped_column(Date, nullable=False)
    acquisition_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    condition: Mapped[str] = mapped_column(String(30), nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="AVAILABLE")
    next_maintenance_due: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("acquisition_cost >= 0", name="chk_assets_acquisition_cost"),
        CheckConstraint("condition IN ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED')", name="chk_assets_condition"),
        CheckConstraint("status IN ('AVAILABLE', 'ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED')", name="chk_assets_status"),
        Index("idx_assets_search", "asset_tag", "serial_number", "name"),
    )

    # Relationships
    category: Mapped[AssetCategory] = relationship("AssetCategory", back_populates="assets")
    allocations: Mapped[List[AssetAllocation]] = relationship("AssetAllocation", back_populates="asset")
    bookings: Mapped[List[ResourceBooking]] = relationship("ResourceBooking", back_populates="asset")
    maintenance_requests: Mapped[List[MaintenanceRequest]] = relationship("MaintenanceRequest", back_populates="asset")
    audit_items: Mapped[List[AuditItem]] = relationship("AuditItem", back_populates="asset")


# ==========================================
# 3. Allocation & Transfer Workflows
# ==========================================

class AssetAllocation(Base):
    __tablename__ = "asset_allocations"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    allocated_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False)
    allocation_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    expected_return_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_return_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    checkout_condition: Mapped[str] = mapped_column(String(30), nullable=False)
    checkin_condition: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    checkin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("checkout_condition IN ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED')", name="chk_allocations_checkout_condition"),
        CheckConstraint("checkin_condition IS NULL OR checkin_condition IN ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED')", name="chk_allocations_checkin_condition"),
        CheckConstraint("status IN ('ACTIVE', 'RETURNED', 'TRANSFERRED')", name="chk_allocations_status"),
        CheckConstraint("expected_return_date IS NULL OR expected_return_date >= allocation_date", name="chk_expected_return"),
        CheckConstraint("actual_return_date IS NULL OR actual_return_date >= allocation_date", name="chk_actual_return"),
        Index("idx_active_asset_allocations", "asset_id", unique=True, postgresql_where=text("status = 'ACTIVE'")),
    )

    # Relationships
    asset: Mapped[Asset] = relationship("Asset", back_populates="allocations")
    employee: Mapped[Employee] = relationship("Employee", foreign_keys=[employee_id])
    allocated_by: Mapped[Employee] = relationship("Employee", foreign_keys=[allocated_by_id])


class TransferRequest(Base):
    __tablename__ = "transfer_requests"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    from_employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    to_employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    requested_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False)
    request_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    actioned_by_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    actioned_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="chk_transfers_status"),
        CheckConstraint("from_employee_id <> to_employee_id", name="chk_different_employees"),
    )

    # Relationships
    asset: Mapped[Asset] = relationship("Asset")
    from_employee: Mapped[Employee] = relationship("Employee", foreign_keys=[from_employee_id])
    to_employee: Mapped[Employee] = relationship("Employee", foreign_keys=[to_employee_id])
    requested_by: Mapped[Employee] = relationship("Employee", foreign_keys=[requested_by_id])
    actioned_by: Mapped[Optional[Employee]] = relationship("Employee", foreign_keys=[actioned_by_id])


# ==========================================
# 4. Resource Booking
# ==========================================

class ResourceBooking(Base):
    __tablename__ = "resource_bookings"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    booked_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    booked_for_department_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="UPCOMING")
    purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED')", name="chk_bookings_status"),
        CheckConstraint("start_time < end_time", name="chk_booking_times"),
        Index("idx_resource_bookings_overlap", "asset_id", "start_time", "end_time", postgresql_where=text("status IN ('UPCOMING', 'ONGOING')")),
    )

    # Relationships
    asset: Mapped[Asset] = relationship("Asset", back_populates="bookings")
    booked_by: Mapped[Employee] = relationship("Employee")
    booked_for_department: Mapped[Optional[Department]] = relationship("Department")


# ==========================================
# 5. Maintenance Workflow
# ==========================================

class MaintenanceRequest(Base):
    __tablename__ = "maintenance_requests"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    raised_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    actioned_by_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    actioned_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    technician_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    technician_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name="chk_maintenance_priority"),
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'TECHNICIAN_ASSIGNED', 'IN_PROGRESS', 'RESOLVED')", name="chk_maintenance_status"),
        CheckConstraint("cost IS NULL OR cost >= 0", name="chk_maintenance_cost"),
    )

    # Relationships
    asset: Mapped[Asset] = relationship("Asset", back_populates="maintenance_requests")
    raised_by: Mapped[Employee] = relationship("Employee", foreign_keys=[raised_by_id])
    actioned_by: Mapped[Optional[Employee]] = relationship("Employee", foreign_keys=[actioned_by_id])


# ==========================================
# 6. Asset Audit Cycle
# ==========================================

class AuditCycle(Base):
    __tablename__ = "audit_cycles"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    scope_department_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    scope_location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PLANNED")
    created_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('PLANNED', 'IN_PROGRESS', 'CLOSED')", name="chk_audits_status"),
        CheckConstraint("start_date <= end_date", name="chk_audit_dates"),
    )

    # Relationships
    scope_department: Mapped[Optional[Department]] = relationship("Department")
    created_by: Mapped[Employee] = relationship("Employee")
    auditors: Mapped[List[Employee]] = relationship("Employee", secondary="audit_cycle_auditors")
    items: Mapped[List[AuditItem]] = relationship("AuditItem", back_populates="cycle")


class AuditCycleAuditor(Base):
    __tablename__ = "audit_cycle_auditors"
    
    audit_cycle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("audit_cycles.id", ondelete="CASCADE"), primary_key=True)
    employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), primary_key=True)


class AuditItem(Base):
    __tablename__ = "audit_items"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    audit_cycle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("audit_cycles.id", ondelete="CASCADE"), nullable=False)
    asset_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    auditor_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="UNVERIFIED")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("verification_status IN ('UNVERIFIED', 'VERIFIED', 'MISSING', 'DAMAGED')", name="chk_audit_items_verification_status"),
        UniqueConstraint("audit_cycle_id", "asset_id", name="uq_audit_cycle_asset"),
    )

    # Relationships
    cycle: Mapped[AuditCycle] = relationship("AuditCycle", back_populates="items")
    asset: Mapped[Asset] = relationship("Asset", back_populates="audit_items")
    auditor: Mapped[Optional[Employee]] = relationship("Employee")


# ==========================================
# 7. Activity Logs & Notifications
# ==========================================

class Notification(Base):
    __tablename__ = "notifications"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    recipient_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reference_table: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("type IN ('ALLOCATION', 'MAINTENANCE', 'BOOKING', 'TRANSFER', 'OVERDUE', 'AUDIT')", name="chk_notifications_type"),
        Index("idx_notifications_recipient", "recipient_id", "is_read"),
    )

    # Relationships
    recipient: Mapped[Employee] = relationship("Employee")


class SystemAuditLog(Base):
    __tablename__ = "system_audit_logs"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_name: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    old_values: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_values: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    employee: Mapped[Optional[Employee]] = relationship("Employee")
