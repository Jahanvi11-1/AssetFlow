import { API } from "../api.js";
import { showToast } from "../app.js";

export async function render(container) {
    try {
        const [assets, employees, transfers] = await Promise.all([
            API.getAssets(),
            API.getEmployees(),
            API.getTransfers()
        ]);
        
        // Parse hash params e.g. #/allocations?action=allocate&asset_id=5
        const hash = window.location.hash;
        let actionParam = "";
        let assetIdParam = "";
        
        if (hash.includes("?")) {
            const queryStr = hash.split("?")[1];
            const params = new URLSearchParams(queryStr);
            actionParam = params.get("action") || "";
            assetIdParam = params.get("asset_id") || "";
        }
        
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                <!-- Checkout Form -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fa-solid fa-user-plus"></i> Asset Checkout / Allocation</h3>
                    </div>
                    <form id="checkout-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label class="form-label" for="alloc-asset">Select Asset *</label>
                            <select class="form-control" id="alloc-asset" name="asset_id" required>
                                <option value="">-- Choose Asset --</option>
                                ${assets.map(a => `<option value="${a.id}" ${assetIdParam == a.id && actionParam === 'allocate' ? 'selected' : ''}>${a.asset_tag} - ${a.name} (${a.status})</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="alloc-employee">Allocate To *</label>
                            <select class="form-control" id="alloc-employee" name="employee_id" required>
                                <option value="">-- Choose Employee --</option>
                                ${employees.map(e => `<option value="${e.id}">${e.name} (${e.role})</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="alloc-date">Expected Return Date</label>
                            <input class="form-control" type="date" id="alloc-date" name="expected_return_date">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="alloc-cond">Checkout Condition *</label>
                            <select class="form-control" id="alloc-cond" name="checkout_condition" required>
                                <option value="NEW">NEW</option>
                                <option value="GOOD" selected>GOOD</option>
                                <option value="FAIR">FAIR</option>
                                <option value="POOR">POOR</option>
                                <option value="DAMAGED">DAMAGED</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" type="submit" style="align-self: flex-start; margin-top: 8px;">
                            Complete Checkout
                        </button>
                    </form>
                </div>

                <!-- Return Form -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fa-solid fa-user-minus"></i> Asset Checkin / Return</h3>
                    </div>
                    <form id="checkin-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label class="form-label" for="ret-asset">Select Asset *</label>
                            <select class="form-control" id="ret-asset" name="asset_id" required>
                                <option value="">-- Choose Asset --</option>
                                ${assets.map(a => `<option value="${a.id}" ${assetIdParam == a.id && actionParam === 'return' ? 'selected' : ''}>${a.asset_tag} - ${a.name} (${a.status})</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="ret-cond">Checkin Condition *</label>
                            <select class="form-control" id="ret-cond" name="checkin_condition" required>
                                <option value="NEW">NEW</option>
                                <option value="GOOD" selected>GOOD</option>
                                <option value="FAIR">FAIR</option>
                                <option value="POOR">POOR</option>
                                <option value="DAMAGED">DAMAGED</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="ret-notes">Checkin Notes</label>
                            <textarea class="form-control" id="ret-notes" name="checkin_notes" rows="3" placeholder="Condition details, issues raised, etc."></textarea>
                        </div>
                        <button class="btn btn-secondary" type="submit" style="align-self: flex-start; margin-top: 8px;">
                            Complete Checkin
                        </button>
                    </form>
                </div>
            </div>

            <!-- Transfer Panel -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <!-- Transfer Request Submission -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fa-solid fa-paper-plane"></i> Request Asset Transfer</h3>
                    </div>
                    <form id="transfer-request-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label class="form-label" for="trans-asset">Select Asset *</label>
                            <select class="form-control" id="trans-asset" name="asset_id" required>
                                <option value="">-- Choose Asset --</option>
                                ${assets.map(a => `<option value="${a.id}" ${assetIdParam == a.id && actionParam === 'transfer' ? 'selected' : ''}>${a.asset_tag} - ${a.name} (${a.status})</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="trans-employee">Transfer To Employee *</label>
                            <select class="form-control" id="trans-employee" name="to_employee_id" required>
                                <option value="">-- Choose Employee --</option>
                                ${employees.map(e => `<option value="${e.id}">${e.name} (${e.role})</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="trans-remarks">Remarks / Reason</label>
                            <input class="form-control" type="text" id="trans-remarks" name="remarks" placeholder="Moving to Floor 3, projects reallocation, etc.">
                        </div>
                        <button class="btn btn-primary" type="submit" style="align-self: flex-start; margin-top: 8px;">
                            Submit Request
                        </button>
                    </form>
                </div>

                <!-- Active Transfers Log & Actions -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fa-solid fa-list-check"></i> Pending Transfer Actions</h3>
                    </div>
                    <div class="table-responsive" style="max-height: 380px;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Asset</th>
                                    <th>From/To</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="transfers-table-body">
                                ${transfers.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: var(--outline);">No transfers pending approval.</td></tr>' : ''}
                                ${transfers.map(tr => {
                                    const asset = assets.find(a => a.id === tr.asset_id);
                                    const fromEmp = employees.find(e => e.id === tr.from_employee_id);
                                    const toEmp = employees.find(e => e.id === tr.to_employee_id);
                                    const assetLabel = asset ? asset.asset_tag : "Asset";
                                    const fromLabel = fromEmp ? fromEmp.name : "System";
                                    const toLabel = toEmp ? toEmp.name : "Staff";
                                    
                                    let actButtons = "";
                                    if (tr.status === "PENDING") {
                                        actButtons = `
                                            <div style="display: flex; gap: 4px;">
                                                <button class="btn btn-primary btn-action-transfer" data-id="${tr.id}" data-action="APPROVED" style="padding: 4px 8px; font-size: 11px;">Approve</button>
                                                <button class="btn btn-outline btn-action-transfer" data-id="${tr.id}" data-action="REJECTED" style="padding: 4px 8px; font-size: 11px;">Reject</button>
                                            </div>
                                        `;
                                    } else {
                                        actButtons = `<span style="font-size: 12px; font-family: var(--font-mono);">${tr.status}</span>`;
                                    }
                                    
                                    return `
                                        <tr>
                                            <td><strong>${assetLabel}</strong></td>
                                            <td style="font-size: 12px;">${fromLabel} <i class="fa-solid fa-arrow-right" style="font-size: 10px;"></i> ${toLabel}</td>
                                            <td><span class="badge badge-${tr.status.toLowerCase()}">${tr.status}</span></td>
                                            <td>${actButtons}</td>
                                        </tr>
                                    `;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Wire Checkout Submit
        document.getElementById("checkout-form").onsubmit = async (e) => {
            e.preventDefault();
            const assetId = document.getElementById("alloc-asset").value;
            const empId = parseInt(document.getElementById("alloc-employee").value);
            const returnDate = document.getElementById("alloc-date").value || null;
            const cond = document.getElementById("alloc-cond").value;
            
            try {
                await API.allocateAsset(assetId, {
                    employee_id: empId,
                    expected_return_date: returnDate,
                    checkout_condition: cond
                });
                showToast("Checkout completed successfully!", "success");
                await render(container);
            } catch (err) {
                // If it fails with 409 Conflict, notify user with current holder details!
                showToast(err.message, "error");
            }
        };

        // Wire Checkin Submit
        document.getElementById("checkin-form").onsubmit = async (e) => {
            e.preventDefault();
            const assetId = document.getElementById("ret-asset").value;
            const cond = document.getElementById("ret-cond").value;
            const notes = document.getElementById("ret-notes").value;
            
            try {
                await API.returnAsset(assetId, {
                    checkin_condition: cond,
                    checkin_notes: notes
                });
                showToast("Asset returned and checked in!", "success");
                await render(container);
            } catch (err) {
                showToast(err.message, "error");
            }
        };

        // Wire Transfer Submit
        document.getElementById("transfer-request-form").onsubmit = async (e) => {
            e.preventDefault();
            const assetId = parseInt(document.getElementById("trans-asset").value);
            const empId = parseInt(document.getElementById("trans-employee").value);
            const remarks = document.getElementById("trans-remarks").value;
            
            try {
                await API.createTransfer({
                    asset_id: assetId,
                    to_employee_id: empId,
                    remarks: remarks
                });
                showToast("Transfer request submitted successfully!", "success");
                await render(container);
            } catch (err) {
                showToast(err.message, "error");
            }
        };

        // Wire Transfer Action buttons (Approve/Reject)
        document.querySelectorAll(".btn-action-transfer").forEach(btn => {
            btn.onclick = async () => {
                const trId = btn.getAttribute("data-id");
                const action = btn.getAttribute("data-action");
                
                try {
                    await API.actionTransfer(trId, {
                        status: action,
                        remarks: `${action} via UI dashboard actions`
                    });
                    showToast(`Transfer request was successfully ${action.toLowerCase()}!`, "success");
                    await render(container);
                } catch (err) {
                    showToast(err.message, "error");
                }
            };
        });

    } catch (err) {
        showToast(err.message, "error");
    }
}
