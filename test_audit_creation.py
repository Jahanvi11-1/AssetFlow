import asyncio
from datetime import date
from database import async_session
import models
import schemas
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

async def test():
    async with async_session() as db:
        # Get an employee to act as auditor
        emp_res = await db.execute(select(models.Employee).limit(1))
        auditor = emp_res.scalar()
        print(f"Auditor: {auditor.name} (ID: {auditor.id})")

        # Get Engineering department
        dept_res = await db.execute(select(models.Department).where(models.Department.name == "Engineering"))
        dept = dept_res.scalar()
        print(f"Department: {dept.name} (ID: {dept.id})")

        # Let's see how many assets have active allocations in this department
        query = select(models.Asset).join(models.AssetAllocation).join(models.Employee).where(
            models.AssetAllocation.status == "ACTIVE",
            models.Employee.department_id == dept.id
        )
        assets_res = await db.execute(query)
        assets = assets_res.scalars().all()
        print(f"Number of scoped assets: {len(assets)}")
        for a in assets:
            print(f" - Asset: {a.asset_tag} {a.name}")

        # Now let's try to simulate what routers/audits.py does:
        # Create the AuditCycle
        db_cycle = models.AuditCycle(
            title="Temp Test Audit",
            scope_department_id=dept.id,
            scope_location=None,
            start_date=date.today(),
            end_date=date.today(),
            status="PLANNED",
            created_by_id=auditor.id,
            auditors=[auditor]
        )
        db.add(db_cycle)
        await db.flush()
        print(f"Audit Cycle created with ID: {db_cycle.id}")

        # Scope Assets
        query = select(models.Asset)
        if dept.id:
            query = query.join(models.AssetAllocation).join(models.Employee).where(
                models.AssetAllocation.status == "ACTIVE",
                models.Employee.department_id == dept.id
            )
        
        assets_res = await db.execute(query)
        scoped_assets = assets_res.scalars().all()
        print(f"Found {len(scoped_assets)} assets to insert")
        
        for asset in scoped_assets:
            audit_item = models.AuditItem(
                audit_cycle_id=db_cycle.id,
                asset_id=asset.id,
                verification_status="UNVERIFIED"
            )
            db.add(audit_item)
        
        await db.commit()
        print("Success! Committed successfully.")

if __name__ == "__main__":
    asyncio.run(test())
