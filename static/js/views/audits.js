import { API } from "../api.js";
import { showToast, showModal, closeModal } from "../app.js";

// Helper for asset FontAwesome icons
function getAssetIconClass(assetName) {
    const name = assetName.toLowerCase();
    if (name.includes("laptop") || name.includes("computer") || name.includes("macbook")) return "fa-laptop";
    if (name.includes("chair") || name.includes("stool") || name.includes("seating")) return "fa-chair";
    if (name.includes("monitor") || name.includes("screen") || name.includes("display")) return "fa-desktop";
    if (name.includes("phone") || name.includes("mobile")) return "fa-mobile-screen-button";
    if (name.includes("printer") || name.includes("scanner")) return "fa-print";
    if (name.includes("desk") || name.includes("table")) return "fa-table";
    return "fa-box";
}

export async function render(container) {
    try {
        const [cycles, departments, employees] = await Promise.all([
            API.getAuditCycles(),
            API.getDepartments(),
            API.getEmployees()
        ]);
        
        await renderAuditDashboard(container, cycles, departments, employees);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function renderAuditDashboard(container, cycles, departments, employees) {
    container.innerHTML = `
        <div class="card" id="audit-cycles-card" style="animation: fadeIn 0.25s ease;">
            <div class="card-header">
                <div>
                    <h3 class="card-title"><i class="fa-solid fa-clipboard-list" style="margin-right: 8px;"></i> Corporate Audit Cycles</h3>
                    <p style="font-size: 13px; color: var(--outline); margin-top: 4px;">
                        Manage, plan and track active or scheduled asset validation audits.
                    </p>
                </div>
                <button class="btn btn-primary" id="btn-plan-audit">
                    <i class="fa-solid fa-calendar-plus"></i> Plan Audit Cycle
                </button>
            </div>
            
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Audit Title</th>
                            <th>Scope Details</th>
                            <th>Timeline</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cycles.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--outline);">No audit cycles planned or active.</td></tr>' : ''}
                        ${cycles.map(cy => {
                            const dept = departments.find(d => d.id === cy.scope_department_id);
                            const scopeLabel = cy.scope_location 
                                ? `Location: ${cy.scope_location}` 
                                : `Dept: ${dept ? dept.name : 'All'}`;
                            
                            let actBtn = "";
                            if (cy.status === "PLANNED") {
                                actBtn = `
                                    <button class="btn btn-primary btn-start-cycle" data-id="${cy.id}" style="padding: 6px 12px; font-size: 13px;">
                                        <i class="fa-solid fa-play"></i> Start Cycle
                                    </button>
                                `;
                            } else if (cy.status === "IN_PROGRESS") {
                                actBtn = `
                                    <button class="btn btn-secondary btn-inspect-cycle" data-id="${cy.id}" style="padding: 6px 12px; font-size: 13px;">
                                        <i class="fa-solid fa-clipboard-check"></i> Inspect Items
                                    </button>
                                `;
                            } else {
                                actBtn = `
                                    <button class="btn btn-outline btn-inspect-cycle" data-id="${cy.id}" style="padding: 6px 12px; font-size: 13px;">
                                        <i class="fa-solid fa-circle-info"></i> View Results
                                    </button>
                                `;
                            }

                            return `
                                <tr>
                                    <td><strong>${cy.title}</strong></td>
                                    <td style="font-size: 13px; color: var(--outline);">${scopeLabel}</td>
                                    <td style="font-size: 13px; font-family: var(--font-mono);">${cy.start_date} to ${cy.end_date}</td>
                                    <td><span class="badge badge-${cy.status.toLowerCase()}">${cy.status}</span></td>
                                    <td>${actBtn}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        </div>
        <div id="cycle-inspection-container"></div>
    `;

    // Plan Audit button
    document.getElementById("btn-plan-audit").onclick = () => {
        openPlanAuditModal(container, departments, employees);
    };

    // Start cycle button
    document.querySelectorAll(".btn-start-cycle").forEach(btn => {
        btn.onclick = async () => {
            const cycleId = btn.getAttribute("data-id");
            try {
                await API.updateAuditCycleStatus(cycleId, "IN_PROGRESS");
                showToast("Audit started! Scoped assets have been logged for verification.", "success");
                const updatedCycles = await API.getAuditCycles();
                await renderAuditDashboard(container, updatedCycles, departments, employees);
            } catch (err) {
                showToast(err.message, "error");
            }
        };
    });

    // Inspect cycle button
    document.querySelectorAll(".btn-inspect-cycle").forEach(btn => {
        btn.onclick = async () => {
            const cycleId = parseInt(btn.getAttribute("data-id"));
            const targetCycle = cycles.find(c => c.id === cycleId);
            await loadInspectionPanel(cycleId, targetCycle, container, departments, employees);
        };
    });
}

async function loadInspectionPanel(cycleId, cycle, container, depts, emps) {
    const inspectionDiv = document.getElementById("cycle-inspection-container");
    inspectionDiv.innerHTML = `
        <div style="display: flex; justify-content: center; padding: 40px;">
            <i class="fa-solid fa-spinner fa-spin fa-xl" style="color: var(--primary);"></i>
        </div>
    `;
    
    try {
        const [items, assets, categories] = await Promise.all([
            API.getAuditItems(cycleId),
            API.getAssets(),
            API.getCategories()
        ]);
        
        // Hide the main cycles table card to show detailed view
        const cyclesCard = document.getElementById("audit-cycles-card");
        if (cyclesCard) {
            cyclesCard.style.display = "none";
        }
        
        let showOnlyDiscrepancies = false;
        
        // Helper function to render items list
        const renderPanel = () => {
            const dept = depts.find(d => d.id === cycle.scope_department_id);
            const deptName = dept ? dept.name : "All Departments";
            
            // Calculate progress
            const total = items.length;
            const checked = items.filter(it => it.verification_status !== "UNVERIFIED").length;
            const progress = total > 0 ? Math.round((checked / total) * 100) : 0;
            
            // Discrepancies check
            const flaggedItems = items.filter(it => it.verification_status === "MISSING" || it.verification_status === "DAMAGED");
            const flaggedCount = flaggedItems.length;
            
            // Get auditor details for avatars and list
            const auditorNames = cycle.auditors && cycle.auditors.length > 0
                ? cycle.auditors.map(a => a.name).join(", ")
                : "None assigned";
                
            const avatarsHtml = cycle.auditors && cycle.auditors.length > 0
                ? cycle.auditors.map(aud => {
                    const initials = aud.name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
                    return `
                        <div class="user-avatar" style="width: 32px; height: 32px; font-size: 11px; border: 2px solid var(--surface); margin-left: -8px; font-weight: 700; z-index: 1;">
                            ${initials}
                        </div>
                    `;
                }).join("")
                : "";

            // Filter items if discrepancy mode is toggled
            const displayItems = showOnlyDiscrepancies ? flaggedItems : items;

            // Generate Badge HTML for the header
            let badgeClass = "badge-available";
            if (cycle.status === "PLANNED") badgeClass = "badge-reserved";
            if (cycle.status === "IN_PROGRESS") badgeClass = "badge-available";
            if (cycle.status === "CLOSED") badgeClass = "badge-lost";

            let closeButtonHtml = "";
            if (cycle.status === "IN_PROGRESS") {
                closeButtonHtml = `
                    <button class="btn btn-secondary" id="btn-close-audit" style="background-color: var(--tertiary);">
                        <i class="fa-solid fa-lock"></i> Close Audit Cycle
                    </button>
                `;
            }

            inspectionDiv.innerHTML = `
                <!-- Navigation & Header actions -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; animation: slideIn 0.2s ease;">
                    <button class="btn btn-outline" id="btn-back-to-cycles" style="padding: 8px 16px;">
                        <i class="fa-solid fa-arrow-left"></i> Back to Audit Cycles
                    </button>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-outline" id="btn-export-report" style="padding: 8px 16px;">
                            <i class="fa-solid fa-file-export"></i> Export Report
                        </button>
                        <button class="btn btn-primary" id="btn-save-progress" style="padding: 8px 16px;">
                            <i class="fa-solid fa-floppy-disk"></i> Save Progress
                        </button>
                    </div>
                </div>

                <!-- Page Header Title block -->
                <div style="margin-bottom: 32px; animation: slideIn 0.2s ease;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <span class="badge ${badgeClass}" style="font-size: 10px; font-weight: 700; padding: 2px 8px;">${cycle.status} CYCLE</span>
                    </div>
                    <h2 style="font-size: 28px; font-weight: 700; color: var(--on-background);">Asset Audit</h2>
                    <p style="font-size: 14px; color: var(--outline);">Verification and reconciliation of physical assets across departments.</p>
                </div>

                <!-- Detailed Card -->
                <div class="card" style="animation: slideIn 0.25s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; flex-wrap: wrap; gap: 16px;">
                        <div>
                            <h3 style="font-size: 20px; font-weight: 700; color: var(--on-background); display: flex; align-items: center; gap: 8px;">
                                ${cycle.title}: ${deptName} 
                                <span style="font-size: 14px; font-weight: 400; color: var(--outline); display: inline-flex; align-items: center; gap: 4px; margin-left: 8px;">
                                    <i class="fa-regular fa-calendar" style="font-size: 12px;"></i> ${cycle.start_date} to ${cycle.end_date}
                                </span>
                            </h3>
                            <div style="font-size: 13px; color: var(--outline); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                                <i class="fa-solid fa-user-shield"></i> Auditors: ${auditorNames}
                            </div>
                        </div>
                        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                            <span style="font-size: 11px; font-family: var(--font-mono); color: var(--outline); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">PROGRESS</span>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 20px; font-weight: 700; color: var(--primary);">${progress}%</span>
                                <div style="width: 120px; height: 8px; background-color: var(--surface-container-high); border-radius: var(--radius-pill); overflow: hidden;">
                                    <div style="width: ${progress}%; height: 100%; background-color: var(--primary); border-radius: var(--radius-pill); transition: width 0.3s ease;"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Discrepancy Alert Banner -->
                    ${flaggedCount > 0 ? `
                        <div style="display: flex; align-items: center; gap: 16px; padding: 16px 20px; background-color: var(--error-container); border: 1px solid rgba(186, 26, 26, 0.15); border-radius: var(--radius-md); margin-bottom: 24px;">
                            <div style="width: 38px; height: 38px; border-radius: 50%; background-color: var(--error); display: flex; align-items: center; justify-content: center; color: var(--on-error); flex-shrink: 0;">
                                <i class="fa-solid fa-triangle-exclamation"></i>
                            </div>
                            <div style="flex-grow: 1;">
                                <h4 style="font-weight: 700; color: var(--on-error-container); font-size: 13px; text-transform: uppercase; letter-spacing: 0.02em;">Discrepancy Alert</h4>
                                <p style="font-size: 13px; color: var(--on-error-container); margin-top: 2px;">
                                    ${flaggedCount} assets flagged - discrepancy report generated automatically. Review is required before closing the cycle.
                                </p>
                            </div>
                            <button class="btn btn-outline" id="btn-review-discrepancy" style="background-color: var(--surface); border-color: var(--error); color: var(--error); padding: 6px 12px; font-size: 12px; font-weight: 700;">
                                ${showOnlyDiscrepancies ? 'Show All Items' : 'Review Now'}
                            </button>
                        </div>
                    ` : ''}

                    <!-- Items Checklist Table -->
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Asset Details</th>
                                    <th>Expected Location</th>
                                    <th>Verification</th>
                                    <th>Verified At</th>
                                    <th>Notes</th>
                                    ${cycle.status === 'IN_PROGRESS' ? '<th>Action</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${displayItems.length === 0 ? `
                                    <tr>
                                        <td colspan="${cycle.status === 'IN_PROGRESS' ? 6 : 5}" style="text-align: center; color: var(--outline); padding: 32px;">
                                            ${showOnlyDiscrepancies ? 'No discrepancy assets found in this audit.' : 'No items found in this audit.'}
                                        </td>
                                    </tr>
                                ` : ''}
                                ${displayItems.map(it => {
                                    const asset = assets.find(a => a.id === it.asset_id);
                                    const assetName = asset ? asset.name : "Asset";
                                    const assetTag = asset ? asset.asset_tag : "N/A";
                                    const assetSerial = asset ? asset.serial_number : "";
                                    const assetLoc = asset ? asset.location : "N/A";
                                    const cat = asset ? categories.find(c => c.id === asset.category_id) : null;
                                    const categoryName = cat ? cat.name : "Category";
                                    
                                    let verBadgeClass = "badge-inactive";
                                    let verText = "Unverified";
                                    if (it.verification_status === "VERIFIED") {
                                        verBadgeClass = "badge-available";
                                        verText = "Verified";
                                    } else if (it.verification_status === "MISSING") {
                                        verBadgeClass = "badge-maintenance";
                                        verText = "Missing";
                                    } else if (it.verification_status === "DAMAGED") {
                                        verBadgeClass = "badge-reserved";
                                        verText = "Damaged";
                                    }

                                    const verDate = it.verified_at ? new Date(it.verified_at).toLocaleDateString() : "-";
                                    
                                    return `
                                        <tr>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 12px;">
                                                    <div style="width: 36px; height: 36px; background-color: var(--surface-container-low); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: var(--primary); flex-shrink: 0;">
                                                        <i class="fa-solid ${getAssetIconClass(assetName)}" style="font-size: 16px;"></i>
                                                    </div>
                                                    <div>
                                                        <p style="font-weight: 600; color: var(--on-background); font-size: 14px; margin-bottom: 2px;">
                                                            ${assetTag} ${assetName}
                                                        </p>
                                                        <p style="font-size: 11px; color: var(--outline); font-family: var(--font-mono);">
                                                            ${categoryName} ${assetSerial ? `• SN: ${assetSerial}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 6px;">
                                                    <i class="fa-solid fa-location-dot" style="color: var(--outline); font-size: 12px;"></i>
                                                    <span style="font-size: 13px;">${assetLoc}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge ${verBadgeClass}">${verText}</span>
                                            </td>
                                            <td style="font-size: 13px; font-family: var(--font-mono);">${verDate}</td>
                                            <td style="font-size: 13px; color: var(--outline); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                ${it.notes || '-'}
                                            </td>
                                            ${cycle.status === 'IN_PROGRESS' ? `
                                                <td>
                                                    <button class="btn btn-primary btn-update-item" data-item-id="${it.id}" style="padding: 6px 12px; font-size: 11px;">
                                                        Log Check
                                                    </button>
                                                </td>
                                            ` : ''}
                                        </tr>
                                    `;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>

                    <!-- Bottom Action area inside card -->
                    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--outline-variant); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="display: flex; flex-direction: row; margin-left: 8px;">
                                ${avatarsHtml}
                            </div>
                            <span style="font-size: 13px; color: var(--outline); ${avatarsHtml ? 'margin-left: 8px;' : ''}">Active auditors on site</span>
                        </div>
                        ${closeButtonHtml}
                    </div>
                </div>
            `;

            // Wire up back to cycles button
            document.getElementById("btn-back-to-cycles").onclick = () => {
                const card = document.getElementById("audit-cycles-card");
                if (card) {
                    card.style.display = "block";
                }
                inspectionDiv.innerHTML = "";
            };

            // Wire up export button
            document.getElementById("btn-export-report").onclick = () => {
                exportAuditCSV(cycle.title, items, assets);
            };

            // Wire up save progress button
            document.getElementById("btn-save-progress").onclick = () => {
                showToast("Audit progress saved successfully!", "success");
            };

            // Wire up review discrepancy button
            const btnReview = document.getElementById("btn-review-discrepancy");
            if (btnReview) {
                btnReview.onclick = () => {
                    showOnlyDiscrepancies = !showOnlyDiscrepancies;
                    renderPanel();
                };
            }

            // Wire up item update button
            document.querySelectorAll(".btn-update-item").forEach(btn => {
                btn.onclick = () => {
                    const itemId = btn.getAttribute("data-item-id");
                    const item = items.find(i => i.id == itemId);
                    openUpdateItemModal(itemId, item, cycleId, cycle, container, depts, emps, renderPanel);
                };
            });

            // Wire up close cycle action
            const btnClose = document.getElementById("btn-close-audit");
            if (btnClose) {
                btnClose.onclick = async () => {
                    if (confirm("Are you sure you want to close this audit cycle? Any missing assets will automatically transition to LOST in the registry.")) {
                        try {
                            await API.closeAuditCycle(cycleId);
                            showToast("Audit cycle closed! Missing assets updated to LOST.", "success");
                            const updatedCycles = await API.getAuditCycles();
                            await renderAuditDashboard(container, updatedCycles, depts, emps);
                        } catch (err) {
                            showToast(err.message, "error");
                        }
                    }
                };
            }
        };

        // Render the detailed panel initially
        renderPanel();
        
        // Smooth scroll to inspection panel
        inspectionDiv.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        showToast(err.message, "error");
    }
}

function openUpdateItemModal(itemId, item, cycleId, cycle, container, depts, emps, onUpdateSuccess) {
    const bodyHtml = `
        <form id="update-item-form">
            <div class="form-group" style="margin-bottom: 16px;">
                <label class="form-label" for="item-status">Verification Status *</label>
                <select class="form-control" id="item-status" name="verification_status" required>
                    <option value="VERIFIED" ${item.verification_status === 'VERIFIED' ? 'selected' : ''}>VERIFIED (Asset Found & Intact)</option>
                    <option value="MISSING" ${item.verification_status === 'MISSING' ? 'selected' : ''}>MISSING (Cannot locate asset)</option>
                    <option value="DAMAGED" ${item.verification_status === 'DAMAGED' ? 'selected' : ''}>DAMAGED (Found but needs repairs)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="item-notes">Verification Notes</label>
                <textarea class="form-control" id="item-notes" name="notes" rows="3" placeholder="Condition notes, last seen details...">${item.notes || ''}</textarea>
            </div>
        </form>
    `;

    showModal({
        title: "Log Asset Verification Check",
        bodyHtml,
        confirmText: "Save Check",
        onConfirm: async (payload) => {
            try {
                await API.updateAuditItem(itemId, payload);
                showToast("Verification check logged successfully!", "success");
                closeModal();
                
                // Fetch updated items and trigger re-render of panel
                const updatedItems = await API.getAuditItems(cycleId);
                
                // Update the items array in-place to keep reference
                item.verification_status = payload.verification_status;
                item.notes = payload.notes;
                item.verified_at = new Date().toISOString();
                
                onUpdateSuccess();
            } catch (err) {
                showToast(err.message, "error");
                throw err;
            }
        }
    });
}

function openPlanAuditModal(container, depts, emps) {
    const today = new Date().toISOString().split("T")[0];
    
    const bodyHtml = `
        <form id="plan-audit-form">
            <div class="form-group" style="margin-bottom: 16px;">
                <label class="form-label" for="audit-title">Audit Title *</label>
                <input class="form-control" type="text" id="audit-title" name="title" required placeholder="H1 Office Equipment Audit">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div class="form-group">
                    <label class="form-label" for="audit-loc">Scope Location</label>
                    <input class="form-control" type="text" id="audit-loc" name="scope_location" placeholder="HQ-Floor-3">
                </div>
                <div class="form-group">
                    <label class="form-label" for="audit-dept">Scope Department</label>
                    <select class="form-control" id="audit-dept" name="scope_department_id">
                        <option value="">-- All Departments --</option>
                        ${depts.map(d => `<option value="${d.id}">${d.name}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div class="form-group">
                    <label class="form-label" for="audit-start">Start Date *</label>
                    <input class="form-control" type="date" id="audit-start" name="start_date" required value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="audit-end">End Date *</label>
                    <input class="form-control" type="date" id="audit-end" name="end_date" required value="${today}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="audit-auditors">Select Auditors *</label>
                <select class="form-control" id="audit-auditors" name="auditor_ids" multiple required style="height: 100px;">
                    ${emps.map(e => `<option value="${e.id}">${e.name} (${e.role})</option>`).join("")}
                </select>
                <small style="color: var(--outline); font-size: 11px; margin-top: 4px;">Hold Ctrl (Cmd) to select multiple auditors.</small>
            </div>
        </form>
    `;

    showModal({
        title: "Plan Audit Cycle",
        bodyHtml,
        confirmText: "Schedule Audit",
        onConfirm: async (payload) => {
            // Multiple select list mapping
            const selectEl = document.getElementById("audit-auditors");
            const auditorIds = Array.from(selectEl.selectedOptions).map(opt => parseInt(opt.value));
            
            payload.auditor_ids = auditorIds;
            if (payload.scope_department_id) {
                payload.scope_department_id = parseInt(payload.scope_department_id);
            } else {
                delete payload.scope_department_id;
            }
            if (!payload.scope_location) {
                delete payload.scope_location;
            }

            try {
                await API.createAuditCycle(payload);
                showToast("Audit cycle planned successfully!", "success");
                closeModal();
                const updatedCycles = await API.getAuditCycles();
                await renderAuditDashboard(container, updatedCycles, depts, emps);
            } catch (err) {
                showToast(err.message, "error");
                throw err;
            }
        }
    });
}

function exportAuditCSV(cycleTitle, items, assets) {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Asset Tag,Asset Name,Expected Location,Verification Status,Verified At,Notes\r\n";
    items.forEach(it => {
        const asset = assets.find(a => a.id === it.asset_id);
        const assetName = asset ? asset.name.replace(/,/g, "") : "";
        const assetTag = asset ? asset.asset_tag : "";
        const assetLoc = asset ? asset.location.replace(/,/g, "") : "";
        const verStatus = it.verification_status;
        const verDate = it.verified_at ? new Date(it.verified_at).toLocaleDateString() : "";
        const notes = it.notes ? it.notes.replace(/,/g, "") : "";
        csvContent += `${assetTag},${assetName},${assetLoc},${verStatus},${verDate},${notes}\r\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${cycleTitle.replace(/\s+/g, "_")}_audit_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Audit report exported successfully!", "success");
}
