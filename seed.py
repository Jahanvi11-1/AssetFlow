import asyncio
from datetime import date, datetime, timedelta
from sqlalchemy import text
from database import engine, async_session
import models
from routers.auth import get_password_hash

async def seed_data():
    print("Starting database seeding...")
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
        
    async with async_session() as db:
        # 1. Clean existing records in correct order
        print("Cleaning old data...")
        await db.execute(text("UPDATE departments SET department_head_id = NULL"))
        await db.execute(text("DELETE FROM system_audit_logs"))
        await db.execute(text("DELETE FROM notifications"))
        await db.execute(text("DELETE FROM audit_items"))
        await db.execute(text("DELETE FROM audit_cycle_auditors"))
        await db.execute(text("DELETE FROM audit_cycles"))
        await db.execute(text("DELETE FROM maintenance_requests"))
        await db.execute(text("DELETE FROM resource_bookings"))
        await db.execute(text("DELETE FROM transfer_requests"))
        await db.execute(text("DELETE FROM asset_allocations"))
        await db.execute(text("DELETE FROM assets"))
        await db.execute(text("DELETE FROM asset_categories"))
        await db.execute(text("DELETE FROM employees"))
        await db.execute(text("DELETE FROM departments"))
        await db.commit()
        
        # 2. Seed Departments
        print("Seeding departments...")
        dept_exec = models.Department(name="Executive Office", status="ACTIVE")
        db.add(dept_exec)
        await db.flush()
        
        dept_eng = models.Department(
            name="Engineering", 
            parent_department_id=dept_exec.id, 
            status="ACTIVE"
        )
        dept_ops = models.Department(
            name="Operations", 
            parent_department_id=dept_exec.id, 
            status="ACTIVE"
        )
        db.add(dept_eng)
        db.add(dept_ops)
        await db.flush()
        
        # 3. Seed Employees
        print("Seeding employees...")
        hashed_pwd = get_password_hash("Password123")
        
        emp_admin = models.Employee(
            name="Alice Admin",
            email="alice@assetflow.com",
            password_hash=hashed_pwd,
            department_id=dept_exec.id,
            role="ADMIN",
            status="ACTIVE"
        )
        emp_manager = models.Employee(
            name="Bob Manager",
            email="bob@assetflow.com",
            password_hash=hashed_pwd,
            department_id=dept_ops.id,
            role="ASSET_MANAGER",
            status="ACTIVE"
        )
        emp_head = models.Employee(
            name="Charlie Head",
            email="charlie@assetflow.com",
            password_hash=hashed_pwd,
            department_id=dept_eng.id,
            role="DEPARTMENT_HEAD",
            status="ACTIVE"
        )
        emp_priya = models.Employee(
            name="Priya Patel",
            email="priya@assetflow.com",
            password_hash=hashed_pwd,
            department_id=dept_eng.id,
            role="EMPLOYEE",
            status="ACTIVE"
        )
        emp_raj = models.Employee(
            name="Raj Singh",
            email="raj@assetflow.com",
            password_hash=hashed_pwd,
            department_id=dept_eng.id,
            role="EMPLOYEE",
            status="ACTIVE"
        )
        
        db.add_all([emp_admin, emp_manager, emp_head, emp_priya, emp_raj])
        await db.flush()
        
        # Resolve department head circular FK
        dept_eng.department_head_id = emp_head.id
        await db.flush()
        
        # 4. Seed Asset Categories
        print("Seeding categories...")
        cat_it = models.AssetCategory(name="IT Hardware", status="ACTIVE")
        cat_furn = models.AssetCategory(name="Office Furniture", status="ACTIVE")
        cat_lab = models.AssetCategory(name="Lab Equipment", status="ACTIVE")
        db.add_all([cat_it, cat_furn, cat_lab])
        await db.flush()
        
        # 5. Seed Assets
        print("Seeding assets...")
        asset_mac = models.Asset(
            asset_tag="AST-001",
            name="MacBook Pro 16",
            category_id=cat_it.id,
            serial_number="SN-MAC16",
            acquisition_date=date.today() - timedelta(days=365),
            acquisition_cost=2500.00,
            condition="GOOD",
            location="HQ-Floor-3",
            is_shared=False,
            status="ALLOCATED"
        )
        asset_mon = models.Asset(
            asset_tag="AST-002",
            name="Dell 27 Monitor",
            category_id=cat_it.id,
            serial_number="SN-DELL27",
            acquisition_date=date.today() - timedelta(days=180),
            acquisition_cost=350.00,
            condition="NEW",
            location="HQ-Floor-3",
            is_shared=False,
            status="AVAILABLE"
        )
        asset_spec = models.Asset(
            asset_tag="AST-003",
            name="Lab Spectrometer",
            category_id=cat_lab.id,
            serial_number="SN-SPECTRO",
            acquisition_date=date.today() - timedelta(days=730),
            acquisition_cost=15000.00,
            condition="FAIR",
            location="Lab-Alpha",
            is_shared=False,
            status="UNDER_MAINTENANCE"
        )
        asset_desk = models.Asset(
            asset_tag="AST-004",
            name="Ergonomic Desk",
            category_id=cat_furn.id,
            serial_number="SN-DESK42",
            acquisition_date=date.today() - timedelta(days=90),
            acquisition_cost=450.00,
            condition="GOOD",
            location="HQ-Floor-2",
            is_shared=True,
            status="AVAILABLE"
        )
        
        db.add_all([asset_mac, asset_mon, asset_spec, asset_desk])
        await db.flush()
        
        # 6. Seed Active Allocation (Priya Patel holds MacBook Pro 16)
        print("Seeding allocations...")
        alloc_mac = models.AssetAllocation(
            asset_id=asset_mac.id,
            employee_id=emp_priya.id,
            allocated_by_id=emp_manager.id,
            allocation_date=date.today() - timedelta(days=30),
            expected_return_date=date.today() + timedelta(days=335),
            checkout_condition="GOOD",
            status="ACTIVE"
        )
        db.add(alloc_mac)
        await db.flush()
        
        # 7. Seed Maintenance Request (Lab Spectrometer under calibration)
        print("Seeding maintenance...")
        maint_spec = models.MaintenanceRequest(
            asset_id=asset_spec.id,
            raised_by_id=emp_manager.id,
            issue_description="Optics misaligned, recalibration required.",
            priority="HIGH",
            status="IN_PROGRESS",
            technician_name="Dr. Clara O'Donnell",
            cost=500.00
        )
        db.add(maint_spec)
        await db.flush()
        
        # 8. Seed Resource Booking (Ergonomic Desk booked by Charlie Head)
        print("Seeding bookings...")
        now = datetime.now()
        booking_desk = models.ResourceBooking(
            asset_id=asset_desk.id,
            booked_by_id=emp_head.id,
            booked_for_department_id=dept_eng.id,
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=6),
            status="ONGOING",
            purpose="Temporary workstation for visiting developer"
        )
        db.add(booking_desk)
        await db.flush()
        
        # 9. Seed Transfer Request (Raj requests the MacBook Priya holds)
        print("Seeding transfer requests...")
        transfer_req = models.TransferRequest(
            asset_id=asset_mac.id,
            from_employee_id=emp_priya.id,
            to_employee_id=emp_raj.id,
            requested_by_id=emp_raj.id,
            status="PENDING",
            remarks="Priya agreed to transfer this laptop as she got a desktop."
        )
        db.add(transfer_req)
        await db.flush()
        
        # 10. Audit log seeding
        audit_log = models.SystemAuditLog(
            employee_id=emp_admin.id,
            action="SEED_DATABASE",
            entity_name="Database",
            entity_id=0,
            new_values={"status": "seeded"}
        )
        db.add(audit_log)
        
        await db.commit()
        print("Database successfully seeded!")

if __name__ == "__main__":
    asyncio.run(seed_data())
