import sys
import time
import threading
from datetime import datetime, timedelta, date
import httpx
import uvicorn

from main import app

# Target URL of the background server
BASE_URL = "http://127.0.0.1:8000"

def run_server():
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")

def run_tests():
    print("==================================================")
    print("AssetFlow Backend E2E Integration Verification")
    print("==================================================")
    
    # 1. Start Server in background
    print("Starting background server...")
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Give the server a moment to start up
    time.sleep(3)
    
    client = httpx.Client(base_url=BASE_URL)
    
    try:
        # 1. Login
        print("\n[Test 1] Logging in as Admin...")
        login_res = client.post("/auth/login", json={"email": "alice@assetflow.com", "password": "Password123"})
        assert login_res.status_code == 200, f"Login failed: {login_res.status_code} - {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("Success! Token obtained.")

        # 2. Get me
        me_res = client.get("/auth/me", headers=headers)
        assert me_res.status_code == 200, f"Get me failed: {me_res.text}"
        assert me_res.json()["email"] == "alice@assetflow.com"
        print(f"Logged in as: {me_res.json()['name']} ({me_res.json()['role']})")

        # 3. Double Allocation Block Test
        print("\n[Test 2] Testing Double Allocation Prevention...")
        # Fetch Priya's and Raj's employee IDs
        employees_res = client.get("/employees", headers=headers)
        assert employees_res.status_code == 200, f"List employees failed: {employees_res.text}"
        employees = employees_res.json()
        priya = [e for e in employees if e["email"] == "priya@assetflow.com"][0]
        raj = [e for e in employees if e["email"] == "raj@assetflow.com"][0]
        
        # Fetch Asset AST-001 (MacBook Pro 16)
        assets_res = client.get("/assets?q=AST-001", headers=headers)
        assert assets_res.status_code == 200, f"Search asset failed: {assets_res.text}"
        macbook = assets_res.json()[0]
        assert macbook["status"] == "ALLOCATED"
        
        # Try to allocate MacBook to Raj
        alloc_payload = {
            "employee_id": raj["id"],
            "checkout_condition": "GOOD"
        }
        alloc_res = client.post(f"/assets/{macbook['id']}/allocate", json=alloc_payload, headers=headers)
        assert alloc_res.status_code == 409, f"Expected 409 Conflict, got {alloc_res.status_code}: {alloc_res.text}"
        print(f"Blocked double allocation successfully! Message: {alloc_res.json()['detail']}")
        assert "Priya Patel" in alloc_res.json()["detail"], "Holder name not returned in details"

        # 4. Resource Booking Overlap Test
        print("\n[Test 3] Testing Booking Overlap Prevention...")
        # Fetch desk AST-004
        desk_res = client.get("/assets?q=AST-004", headers=headers)
        assert desk_res.status_code == 200, f"Search desk failed: {desk_res.text}"
        desk = desk_res.json()[0]
        
        # Create an overlapping booking
        now = datetime.utcnow()
        overlap_payload = {
            "asset_id": desk["id"],
            "start_time": (now - timedelta(hours=1)).isoformat() + "Z",
            "end_time": (now + timedelta(hours=2)).isoformat() + "Z",
            "purpose": "Overlapping reservation request"
        }
        booking_res = client.post("/bookings", json=overlap_payload, headers=headers)
        assert booking_res.status_code == 409, f"Expected 409 Conflict, got {booking_res.status_code}: {booking_res.text}"
        print(f"Blocked overlapping booking successfully! Message: {booking_res.json()['detail']}")

        # 5. Maintenance Kanban flow State transitions
        print("\n[Test 4] Testing Maintenance State Machine Kanban transitions...")
        # Register new asset with unique dynamic tag for maintenance test
        ts = int(time.time())
        new_asset_payload = {
            "asset_tag": f"AST-TEMP-MAINT-{ts}",
            "name": "Test Laptop",
            "category_id": macbook["category_id"],
            "serial_number": f"SN-TEMP-MAINT-{ts}",
            "acquisition_date": "2026-01-01",
            "acquisition_cost": 1200.00,
            "condition": "GOOD",
            "location": "HQ-Floor-3"
        }
        temp_asset_res = client.post("/assets", json=new_asset_payload, headers=headers)
        assert temp_asset_res.status_code == 201, f"Create temp asset failed: {temp_asset_res.status_code} - {temp_asset_res.text}"
        temp_asset = temp_asset_res.json()
        
        # Raise request (PENDING)
        maint_payload = {
            "asset_id": temp_asset["id"],
            "issue_description": "Keyboard backlight broken",
            "priority": "LOW"
        }
        maint_req_res = client.post("/maintenance", json=maint_payload, headers=headers)
        assert maint_req_res.status_code == 201, f"Create maint request failed: {maint_req_res.text}"
        maint_req = maint_req_res.json()
        assert maint_req["status"] == "PENDING"
        
        # Verify asset is UNDER_MAINTENANCE
        chk_asset = client.get(f"/assets/{temp_asset['id']}", headers=headers).json()
        assert chk_asset["status"] == "UNDER_MAINTENANCE"
        print("Maintenance request created. Asset status set to UNDER_MAINTENANCE.")
        
        # Transition to APPROVED
        action_approved = {"status": "APPROVED"}
        maint_req = client.put(f"/maintenance/{maint_req['id']}/status", json=action_approved, headers=headers).json()
        assert maint_req["status"] == "APPROVED"
        
        # Transition to TECHNICIAN_ASSIGNED
        action_tech = {"status": "TECHNICIAN_ASSIGNED", "technician_name": "John Doe", "technician_notes": "Awaiting parts"}
        maint_req = client.put(f"/maintenance/{maint_req['id']}/status", json=action_tech, headers=headers).json()
        assert maint_req["status"] == "TECHNICIAN_ASSIGNED"
        assert maint_req["technician_name"] == "John Doe"
        
        # Transition to IN_PROGRESS
        action_progress = {"status": "IN_PROGRESS"}
        maint_req = client.put(f"/maintenance/{maint_req['id']}/status", json=action_progress, headers=headers).json()
        assert maint_req["status"] == "IN_PROGRESS"
        
        # Transition to RESOLVED
        action_resolve = {"status": "RESOLVED", "cost": 75.50, "technician_notes": "Replaced light strips"}
        maint_req = client.put(f"/maintenance/{maint_req['id']}/status", json=action_resolve, headers=headers).json()
        assert maint_req["status"] == "RESOLVED"
        assert float(maint_req["cost"]) == 75.50
        
        # Verify asset is back to AVAILABLE
        chk_asset = client.get(f"/assets/{temp_asset['id']}", headers=headers).json()
        assert chk_asset["status"] == "AVAILABLE"
        print("Maintenance resolved successfully. Asset status reverted to AVAILABLE.")

        # 6. Audit Closing Routine Test
        print("\n[Test 5] Testing Audit cycle stocktake and closing routine...")
        # Register new asset with unique dynamic tag for audit test
        audit_asset_payload = {
            "asset_tag": f"AST-TEMP-AUDIT-{ts}",
            "name": "Audit Test Laptop",
            "category_id": macbook["category_id"],
            "serial_number": f"SN-TEMP-AUDIT-{ts}",
            "acquisition_date": "2026-01-01",
            "acquisition_cost": 1000.00,
            "condition": "GOOD",
            "location": "HQ-Floor-4"
        }
        audit_asset_res = client.post("/assets", json=audit_asset_payload, headers=headers)
        assert audit_asset_res.status_code == 201, f"Create audit asset failed: {audit_asset_res.text}"
        audit_asset = audit_asset_res.json()
        
        # Create Audit Cycle scoped by location HQ-Floor-4
        audit_cycle_payload = {
            "title": "Floor 4 Stocktake",
            "scope_location": "HQ-Floor-4",
            "start_date": "2026-07-01",
            "end_date": "2026-07-15",
            "auditor_ids": [me_res.json()["id"]]
        }
        audit_cycle_res = client.post("/audits/cycles", json=audit_cycle_payload, headers=headers)
        assert audit_cycle_res.status_code == 201, f"Create audit cycle failed: {audit_cycle_res.text}"
        audit_cycle = audit_cycle_res.json()
        assert audit_cycle["status"] == "PLANNED"
        
        # Start cycle
        audit_cycle_start_res = client.put(f"/audits/cycles/{audit_cycle['id']}/status?status_val=IN_PROGRESS", headers=headers)
        assert audit_cycle_start_res.status_code == 200, f"Start audit cycle failed: {audit_cycle_start_res.text}"
        audit_cycle = audit_cycle_start_res.json()
        assert audit_cycle["status"] == "IN_PROGRESS"
        
        # Check audit items auto-population
        items_res = client.get(f"/audits/cycles/{audit_cycle['id']}/items", headers=headers)
        assert items_res.status_code == 200, f"List audit items failed: {items_res.text}"
        items = items_res.json()
        assert len(items) >= 1
        target_item = [i for i in items if i["asset_id"] == audit_asset["id"]][0]
        assert target_item["verification_status"] == "UNVERIFIED"
        
        # Update item status to MISSING
        item_update_payload = {
            "verification_status": "MISSING",
            "notes": "Not on desk, employee on vacation?"
        }
        updated_item_res = client.put(f"/audits/items/{target_item['id']}", json=item_update_payload, headers=headers)
        assert updated_item_res.status_code == 200, f"Verify audit item failed: {updated_item_res.text}"
        updated_item = updated_item_res.json()
        assert updated_item["verification_status"] == "MISSING"
        
        # Close Audit Cycle
        closed_cycle_res = client.put(f"/audits/cycles/{audit_cycle['id']}/close", headers=headers)
        assert closed_cycle_res.status_code == 200, f"Close audit cycle failed: {closed_cycle_res.text}"
        closed_cycle = closed_cycle_res.json()
        assert closed_cycle["status"] == "CLOSED"
        
        # Verify the asset status in registry is set to LOST
        audited_asset = client.get(f"/assets/{audit_asset['id']}", headers=headers).json()
        assert audited_asset["status"] == "LOST"
        print("Audit cycle closed successfully. Asset automatically transitioned to LOST status.")

        print("\n==================================================")
        print("ALL TESTS PASSED SUCCESSFULLY!")
        print("==================================================")
        
    finally:
        client.close()

if __name__ == "__main__":
    run_tests()
    sys.exit(0)
