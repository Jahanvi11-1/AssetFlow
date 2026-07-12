import { API } from "../api.js";
import { showToast, showModal, closeModal } from "../app.js";

export async function render(container) {
    try {
        const [assets, maintenance] = await Promise.all([
            API.getAssets(),
            API.getMaintenance()
        ]);
        
        // Parse parameters from hash e.g. ?action=report&asset_id=5
        const hash = window.location.hash;
        if (hash.includes("?")) {
            const queryStr = hash.split("?")[1];
            const params = new URLSearchParams(queryStr);
            const action = params.get("action");
            const assetId = params.get("asset_id");
            
            if (action === "report") {
                // Clear query params to prevent modal loop on refresh
                window.history.replaceState(null, null, window.location.pathname + window.location.search + "#/maintenance");
                setTimeout(() => openReportMaintenanceModal(container, assets, assetId ? parseInt(assetId) : null), 100);
            }
        }

        const columns = {
            "PENDING": [],
            "APPROVED": [],
            "TECHNICIAN_ASSIGNED": [],
            "IN_PROGRESS": [],
            "RESOLVED": []
        };

        maintenance.forEach(req => {
            if (columns[req.status]) {
                columns[req.status].push(req);
            }
        });

        container.innerHTML = `
            <div style="margin-bottom: 24px; display: flex; justify-content: flex-end;">
                <button class="btn btn-primary" id="btn-raise-maint">
                    <i class="fa-solid fa-plus"></i> Raise Maintenance Request
                </button>
            </div>
            
            <div class="kanban-board">
                ${Object.keys(columns).map(colStatus => {
                    const reqList = columns[colStatus];
                    const colTitle = colStatus.replace("_", " ");
                    
                    return `
                        <div class="kanban-column">
                            <div class="kanban-column-header">
                                <span class="kanban-column-title">${colTitle}</span>
                                <span class="kanban-column-count">${reqList.length}</span>
                            </div>
                            <div class="kanban-cards-container" data-status="${colStatus}">
                                ${reqList.map(req => {
                                    const asset = assets.find(a => a.id === req.asset_id);
                                    const assetName = asset ? asset.name : `Asset ID: ${req.asset_id}`;
                                    const assetTag = asset ? asset.asset_tag : "Unknown";
                                    
                                    return `
                                        <div class="kanban-card" data-req-id="${req.id}">
                                            <div class="kanban-card-title">${assetName}</div>
                                            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--outline); margin-bottom: 8px;">
                                                Tag: ${assetTag}
                                            </div>
                                            <p style="font-size: 12px; color: var(--on-background); line-height: 1.3;">
                                                ${req.issue_description}
                                            </p>
                                            <div class="kanban-card-meta">
                                                <span class="kanban-card-priority priority-${req.priority}">${req.priority}</span>
                                                <span style="font-size: 11px; color: var(--outline);"><i class="fa-regular fa-clock"></i> ${new Date(req.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    `;
                                }).join("")}
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        // Wire Raise button
        document.getElementById("btn-raise-maint").onclick = () => {
            openReportMaintenanceModal(container, assets);
        };

        // Wire Card detail views
        document.querySelectorAll(".kanban-card").forEach(card => {
            card.onclick = () => {
                const reqId = parseInt(card.getAttribute("data-req-id"));
                const requestDetail = maintenance.find(r => r.id === reqId);
                const asset = assets.find(a => a.id === requestDetail.asset_id);
                openMaintenanceDetailModal(container, requestDetail, asset);
            };
        });

    } catch (err) {
        showToast(err.message, "error");
    }
}

function openReportMaintenanceModal(container, assets, preselectedAssetId = null) {
    const availableAssets = assets.filter(a => a.status === "AVAILABLE" || a.id === preselectedAssetId);
    
    const bodyHtml = `
        <form id="raise-maint-form">
            <div class="form-group" style="margin-bottom: 16px;">
                <label class="form-label" for="maint-asset">Select Target Asset *</label>
                <select class="form-control" id="maint-asset" name="asset_id" required>
                    <option value="">-- Choose Asset --</option>
                    ${availableAssets.map(a => `<option value="${a.id}" ${preselectedAssetId === a.id ? 'selected' : ''}>${a.asset_tag} - ${a.name} (${a.location})</option>`).join("")}
                </select>
            </div>
            <div class="form-group" style="margin-bottom: 16px;">
                <label class="form-label" for="maint-desc">Describe the Issue *</label>
                <textarea class="form-control" id="maint-desc" name="issue_description" rows="4" required placeholder="Backlight screen flickering, keys getting stuck..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 16px;">
                <label class="form-label" for="maint-priority">Priority *</label>
                <select class="form-control" id="maint-priority" name="priority" required>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM" selected>MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                </select>
            </div>
        </form>
    `;

    showModal({
        title: "Report Asset Issue / Request Maintenance",
        bodyHtml,
        confirmText: "Submit Request",
        onConfirm: async (payload) => {
            payload.asset_id = parseInt(payload.asset_id);
            try {
                await API.createMaintenance(payload);
                showToast("Maintenance ticket raised. Asset status changed to UNDER_MAINTENANCE.", "success");
                await render(container);
            } catch (err) {
                showToast(err.message, "error");
                throw err;
            }
        }
    });
}

function openMaintenanceDetailModal(container, req, asset) {
    let actionButtonsHtml = "";
    
    // Renders custom action triggers depending on state transitions
    if (req.status === "PENDING") {
        actionButtonsHtml = `
            <button class="btn btn-primary" id="btn-maint-approve">
                <i class="fa-solid fa-check"></i> Approve Ticket
            </button>
        `;
    } else if (req.status === "APPROVED") {
        actionButtonsHtml = `
            <button class="btn btn-primary" id="btn-maint-assign">
                <i class="fa-solid fa-user-gear"></i> Assign Technician
            </button>
        `;
    } else if (req.status === "TECHNICIAN_ASSIGNED") {
        actionButtonsHtml = `
            <button class="btn btn-primary" id="btn-maint-start">
                <i class="fa-solid fa-play"></i> Start Maintenance
            </button>
        `;
    } else if (req.status === "IN_PROGRESS") {
        actionButtonsHtml = `
            <button class="btn btn-secondary" id="btn-maint-resolve">
                <i class="fa-solid fa-circle-check"></i> Resolve Maintenance
            </button>
        `;
    }

    const bodyHtml = `
        <div style="display: flex; flex-direction: column; gap: 16px; font-size: 14px;">
            <div>
                <strong>Asset Tag:</strong> <span style="font-family: var(--font-mono);">${asset ? asset.asset_tag : 'N/A'}</span>
            </div>
            <div>
                <strong>Asset Name:</strong> ${asset ? asset.name : 'Unknown'}
            </div>
            <div>
                <strong>Issue Description:</strong>
                <p style="margin-top: 6px; padding: 12px; background-color: var(--surface-container-low); border-radius: var(--radius-md); font-style: italic;">
                    ${req.issue_description}
                </p>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div><strong>Priority:</strong> <span class="kanban-card-priority priority-${req.priority}">${req.priority}</span></div>
                <div><strong>Current State:</strong> <span class="badge badge-maintenance">${req.status}</span></div>
                <div><strong>Reported Date:</strong> ${new Date(req.created_at).toLocaleString()}</div>
                <div><strong>Assigned Tech:</strong> ${req.technician_name || 'Unassigned'}</div>
                <div><strong>Resolution Cost:</strong> ${req.cost ? `$${parseFloat(req.cost).toFixed(2)}` : 'N/A'}</div>
                <div><strong>Resolved At:</strong> ${req.resolved_at ? new Date(req.resolved_at).toLocaleString() : 'N/A'}</div>
            </div>
            ${req.technician_notes ? `
                <div>
                    <strong>Technician Notes:</strong>
                    <p style="margin-top: 6px; padding: 12px; background-color: var(--surface-container-low); border-radius: var(--radius-md);">
                        ${req.technician_notes}
                    </p>
                </div>
            ` : ''}
            
            <div style="margin-top: 24px; border-top: 1px solid var(--outline-variant); padding-top: 16px; display: flex; gap: 12px; justify-content: flex-end;">
                ${actionButtonsHtml}
            </div>
        </div>
    `;

    showModal({
        title: "Maintenance Ticket Detail",
        bodyHtml,
        confirmText: "Close Details",
        onConfirm: () => Promise.resolve()
    });

    // Wire approval action
    const btnApprove = document.getElementById("btn-maint-approve");
    if (btnApprove) {
        btnApprove.onclick = async () => {
            try {
                await API.updateMaintenanceStatus(req.id, { status: "APPROVED" });
                showToast("Maintenance ticket approved!", "success");
                closeModal();
                await render(container);
            } catch (err) {
                showToast(err.message, "error");
            }
        };
    }

    // Wire assign tech action
    const btnAssign = document.getElementById("btn-maint-assign");
    if (btnAssign) {
        btnAssign.onclick = () => {
            const subBodyHtml = `
                <form id="assign-tech-form">
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="form-label" for="tech-name">Technician Name *</label>
                        <input class="form-control" type="text" id="tech-name" name="technician_name" required placeholder="John Doe">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="tech-notes">Technician Notes / Assessment</label>
                        <input class="form-control" type="text" id="tech-notes" name="technician_notes" placeholder="Awaiting spare screen replacement parts">
                    </div>
                </form>
            `;
            showModal({
                title: "Assign Repair Technician",
                bodyHtml: subBodyHtml,
                confirmText: "Assign",
                onConfirm: async (payload) => {
                    try {
                        await API.updateMaintenanceStatus(req.id, {
                            status: "TECHNICIAN_ASSIGNED",
                            technician_name: payload.technician_name,
                            technician_notes: payload.technician_notes
                        });
                        showToast(`Technician ${payload.technician_name} assigned!`, "success");
                        closeModal();
                        await render(container);
                    } catch (err) {
                        showToast(err.message, "error");
                        throw err;
                    }
                }
            });
        };
    }

    // Wire start action
    const btnStart = document.getElementById("btn-maint-start");
    if (btnStart) {
        btnStart.onclick = async () => {
            try {
                await API.updateMaintenanceStatus(req.id, { status: "IN_PROGRESS" });
                showToast("Maintenance work started!", "success");
                closeModal();
                await render(container);
            } catch (err) {
                showToast(err.message, "error");
            }
        };
    }

    // Wire resolve action
    const btnResolve = document.getElementById("btn-maint-resolve");
    if (btnResolve) {
        btnResolve.onclick = () => {
            const subBodyHtml = `
                <form id="resolve-maint-form">
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="form-label" for="maint-cost">Repair Cost ($)</label>
                        <input class="form-control" type="number" step="0.01" id="maint-cost" name="cost" placeholder="0.00" value="0.00">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="resolve-notes">Resolution details *</label>
                        <textarea class="form-control" id="resolve-notes" name="technician_notes" rows="3" required placeholder="Fixed screen, backlight replaced. Checked and working."></textarea>
                    </div>
                </form>
            `;
            showModal({
                title: "Complete Maintenance & Resolve",
                bodyHtml: subBodyHtml,
                confirmText: "Resolve Ticket",
                onConfirm: async (payload) => {
                    payload.cost = parseFloat(payload.cost || 0);
                    try {
                        await API.updateMaintenanceStatus(req.id, {
                            status: "RESOLVED",
                            cost: payload.cost,
                            technician_notes: payload.technician_notes
                        });
                        showToast("Maintenance resolved! Asset status reverted to AVAILABLE.", "success");
                        closeModal();
                        await render(container);
                    } catch (err) {
                        showToast(err.message, "error");
                        throw err;
                    }
                }
            });
        };
    }
}
