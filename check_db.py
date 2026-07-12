import asyncio
from sqlalchemy.future import select
from database import async_session
import models

async def check():
    async with async_session() as session:
        # Check audit cycles
        res_cycles = await session.execute(select(models.AuditCycle))
        cycles = res_cycles.scalars().all()
        print(f"Total Audit Cycles: {len(cycles)}")
        for c in cycles:
            print(f"Cycle ID: {c.id}, Title: {c.title}, Department: {c.scope_department_id}, Status: {c.status}")
            
        # Check recent system logs
        res_logs = await session.execute(select(models.SystemAuditLog).order_by(models.SystemAuditLog.created_at.desc()).limit(10))
        logs = res_logs.scalars().all()
        print(f"\nRecent System Logs:")
        for log in logs:
            print(f"Log ID: {log.id}, Action: {log.action}, Entity: {log.entity_name}, ID: {log.entity_id}")

if __name__ == "__main__":
    asyncio.run(check())
