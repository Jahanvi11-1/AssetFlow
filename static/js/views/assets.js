import { API } from "../api.js";
import { showToast, showModal } from "../app.js";

let categoriesList = [];
let departmentsList = [];
let employeesList = [];
let allAssets = [];

export async function render(container) {
    try {
        const [categories, departments, employees, assets] = await Promise.all([
            API.getCategories(),
            API.getDepartments(),
            API.getEmployees(),
            API.getAssets()
        ]);
        
        categoriesList = categories;
        departmentsList = departments;
        employeesList = employees;
        allAssets = assets;
        
        renderAssetsShell(container);
        filterAndPopulateTable();

        // Parse hash params e.g. #/assets?action=register
        const hash = window.location.hash;
        if (hash.includes("?")) {
            const queryStr = hash.split("?")[1];
            const params = new URLSearchParams(queryStr);
            const action = params.get("action");
            
            if (action === "register") {
                // Clear parameters from the URL history
                window.history.replaceState(null, null, window.location.pathname + window.location.search + "#/assets");
                setTimeout(() => openAddAssetModal(container), 100);
            }
        }
    } catch (err) {
        showToast(err.message, "error");
    }
}

function renderAssetsShell(container) {
    container.innerHTML = `
        <div class="card">
            <div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 20px;">
                <div class="search-input-wrapper" style="flex: 2; min-width: 250px;">
                    <i class="fa-solid fa-magnifying-glass search-icon"></i>
                    <input class="search-input" type="text" id="asset-search" placeholder="Search tag, name, serial, location...">
                </div>
                
                <div class="form-group" style="flex: 1; min-width: 140px; margin-bottom: 0;">
                    <select class="form-control" id="filter-category" style="height: 42px; padding: 6px 12px;">
                        <option value="">All Categories</option>
                        ${categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
                    </select>
                </div>
                
                <div class="form-group" style="flex: 1; min-width: 140px; margin-bottom: 0;">
                    <select class="form-control" id="filter-status" style="height: 42px; padding: 6px 12px;">
                        <option value="">All Statuses</option>
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="ALLOCATED">ALLOCATED</option>
                        <option value="UNDER_MAINTENANCE">UNDER_MAINTENANCE</option>
                        <option value="RESERVED">RESERVED</option>
                        <option value="LOST">LOST</option>
                        <option value="RETIRED">RETIRED</option>
                        <option value="DISPOSED">DISPOSED</option>
                    </select>
                </div>

                <div class="form-group" style="flex: 1; min-width: 160px; margin-bottom: 0;">
                    <select class="form-control" id="filter-department" style="height: 42px; padding: 6px 12px;">
                        <option value="">All Departments</option>
                        ${departmentsList.map(d => `<option value="${d.id}">${d.name}</option>`).join("")}
                    </select>
                </div>

                <button class="btn btn-primary" id="btn-add-asset" style="height: 42px; white-space: nowrap;">
                    <i class="fa-solid fa-plus"></i> Register Asset
                </button>
            </div>
            
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Asset Tag</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Location</th>
                            <th>Condition</th>
                            <th>Status</th>
                            <th>Department</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="assets-table-body">
                        <!-- Populated Dynamically -->
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Add listeners
    const searchInput = document.getElementById("asset-search");
    const filterCat = document.getElementById("filter-category");
    const filterStatus = document.getElementById("filter-status");
    const filterDept = document.getElementById("filter-department");

    const onFilterChange = () => {
        filterAndPopulateTable();
    };

    searchInput.addEventListener("input", onFilterChange);
    filterCat.addEventListener("change", onFilterChange);
    filterStatus.addEventListener("change", onFilterChange);
    filterDept.addEventListener("change", onFilterChange);

    // Register button click
    document.getElementById("btn-add-asset").onclick = () => {
        openAddAssetModal(container);
    };
}

function filterAndPopulateTable() {
    const searchInput = document.getElementById("asset-search");
    const filterCat = document.getElementById("filter-category");
    const filterStatus = document.getElementById("filter-status");
    const filterDept = document.getElementById("filter-department");

    const query = searchInput ? searchInput.value.toLowerCase() : "";
    const catId = filterCat ? filterCat.value : "";
    const statusVal = filterStatus ? filterStatus.value : "";
    const deptId = filterDept ? filterDept.value : "";

    const filtered = allAssets.filter(asset => {
        const matchesQuery = !query || 
            asset.asset_tag.toLowerCase().includes(query) ||
            asset.name.toLowerCase().includes(query) ||
            (asset.serial_number && asset.serial_number.toLowerCase().includes(query)) ||
            asset.location.toLowerCase().includes(query);

        const matchesCat = !catId || asset.category_id == catId;
        const matchesStatus = !statusVal || asset.status === statusVal;
        const matchesDept = !deptId || asset.assigned_department_id == deptId;

        return matchesQuery && matchesCat && matchesStatus && matchesDept;
    });

    const tbody = document.getElementById("assets-table-body");
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--outline); padding: 24px;">No matching assets registered.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(asset => {
        const cat = categoriesList.find(c => c.id === asset.category_id);
        const catName = cat ? cat.name : "N/A";
        
        let deptName = "N/A";
        if (asset.assigned_department_id) {
            const dept = departmentsList.find(d => d.id === asset.assigned_department_id);
            deptName = dept ? dept.name : "N/A";
        }
        
        let statusBadge = `badge-${asset.status.toLowerCase()}`;
        
        return `
            <tr>
                <td style="font-family: var(--font-mono); font-weight: 600;">${asset.asset_tag}</td>
                <td>${asset.name}</td>
                <td>${catName}</td>
                <td>${asset.location}</td>
                <td><span style="font-family: var(--font-mono); font-weight: 500;">${asset.condition}</span></td>
                <td><span class="badge ${statusBadge}">${asset.status}</span></td>
                <td><span style="font-size: 13px; font-weight: 500;">${deptName}</span></td>
                <td>
                    <button class="btn btn-text btn-view-detail" data-id="${asset.id}" style="padding: 4px 8px;">
                        <i class="fa-regular fa-eye"></i> View Details
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    // Wire details view button
    tbody.querySelectorAll(".btn-view-detail").forEach(btn => {
        btn.onclick = async () => {
            const assetId = btn.getAttribute("data-id");
            await openAssetDetailsModal(assetId);
        };
    });
}

async function openAssetDetailsModal(assetId) {
    try {
        const asset = await API.getAsset(assetId);
        const cat = categoriesList.find(c => c.id === asset.category_id);
        const catName = cat ? cat.name : "N/A";
        
        let actionsHtml = "";
        if (asset.status === "AVAILABLE") {
            actionsHtml = `
                <button class="btn btn-primary" onclick="window.location.hash='#/allocations?action=allocate&asset_id=${asset.id}'">
                    <i class="fa-solid fa-user-plus"></i> Allocate Asset
                </button>
                <button class="btn btn-secondary" onclick="window.location.hash='#/maintenance?action=report&asset_id=${asset.id}'">
                    <i class="fa-solid fa-screwdriver-wrench"></i> Request Maintenance
                </button>
            `;
        } else if (asset.status === "ALLOCATED") {
            actionsHtml = `
                <button class="btn btn-primary" onclick="window.location.hash='#/allocations?action=return&asset_id=${asset.id}'">
                    <i class="fa-solid fa-user-minus"></i> Return / Checkin
                </button>
                <button class="btn btn-secondary" onclick="window.location.hash='#/allocations?action=transfer&asset_id=${asset.id}'">
                    <i class="fa-solid fa-right-left"></i> Transfer Request
                </button>
            `;
        }

        const bodyHtml = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--outline-variant); padding-bottom: 12px;">
                    <h4 style="font-size: 16px; font-weight: 700;">${asset.name}</h4>
                    <span class="badge badge-${asset.status.toLowerCase()}">${asset.status}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                    <div><strong>Asset Tag:</strong> <span style="font-family: var(--font-mono);">${asset.asset_tag}</span></div>
                    <div><strong>Serial Number:</strong> <span style="font-family: var(--font-mono);">${asset.serial_number || 'N/A'}</span></div>
                    <div><strong>Category:</strong> ${catName}</div>
                    <div><strong>Location:</strong> ${asset.location}</div>
                    <div><strong>Condition:</strong> ${asset.condition}</div>
                    <div><strong>Is Shared:</strong> ${asset.is_shared ? 'Yes (Resource Booking)' : 'No (Individual)'}</div>
                    <div><strong>Acquisition Cost:</strong> $${parseFloat(asset.acquisition_cost).toFixed(2)}</div>
                    <div><strong>Acquisition Date:</strong> ${asset.acquisition_date}</div>
                </div>
                <div style="margin-top: 16px; display: flex; gap: 12px; justify-content: flex-end;">
                    ${actionsHtml}
                </div>
            </div>
        `;
        
        showModal({
            title: "Asset Details Summary",
            bodyHtml,
            confirmText: "Close Details",
            onConfirm: () => Promise.resolve()
        });
    } catch (err) {
        showToast(err.message, "error");
    }
}

function openAddAssetModal(container) {
    const today = new Date().toISOString().split("T")[0];
    
    const bodyHtml = `
        <form id="add-asset-form">
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label" for="add-asset-tag">Asset Tag *</label>
                    <input class="form-control" type="text" id="add-asset-tag" name="asset_tag" required placeholder="AST-100">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-asset-name">Asset Name *</label>
                    <input class="form-control" type="text" id="add-asset-name" name="name" required placeholder="MacBook Pro 14">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-asset-cat">Category *</label>
                    <select class="form-control" id="add-asset-cat" name="category_id" required>
                        ${categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-asset-serial">Serial Number</label>
                    <input class="form-control" type="text" id="add-asset-serial" name="serial_number" placeholder="C02XXYYZZ">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-asset-date">Acquisition Date *</label>
                    <input class="form-control" type="date" id="add-asset-date" name="acquisition_date" required value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-asset-cost">Acquisition Cost ($) *</label>
                    <input class="form-control" type="number" step="0.01" id="add-asset-cost" name="acquisition_cost" required placeholder="1499.00">
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-asset-cond">Condition *</label>
                    <select class="form-control" id="add-asset-cond" name="condition" required>
                        <option value="NEW">NEW</option>
                        <option value="GOOD" selected>GOOD</option>
                        <option value="FAIR">FAIR</option>
                        <option value="POOR">POOR</option>
                        <option value="DAMAGED">DAMAGED</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="add-asset-loc">Location *</label>
                    <input class="form-control" type="text" id="add-asset-loc" name="location" required placeholder="HQ-Floor-2">
                </div>
                <div class="form-group">
                    <label class="form-label" style="display: flex; align-items: center; gap: 8px; margin-top: 24px;">
                        <input type="checkbox" name="is_shared" value="true"> Shared Resource (Bookable)
                    </label>
                </div>
            </div>
        </form>
    `;
    
    showModal({
        title: "Register New Asset",
        bodyHtml,
        confirmText: "Register",
        onConfirm: async (payload) => {
            payload.is_shared = !!payload.is_shared;
            payload.acquisition_cost = parseFloat(payload.acquisition_cost);
            payload.category_id = parseInt(payload.category_id);
            
            try {
                await API.createAsset(payload);
                showToast("Asset registered successfully!", "success");
                allAssets = await API.getAssets();
                filterAndPopulateTable();
            } catch (err) {
                showToast(err.message, "error");
                throw err;
            }
        }
    });
}
