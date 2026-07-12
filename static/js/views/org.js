import { API } from "../api.js";
import { showToast } from "../app.js";

let currentTab = "DEPARTMENT"; // Default tab: DEPARTMENT
let viewMode = "LIST"; // Default mode: LIST

export async function render(container) {
    try {
        const [departments, categories, employees] = await Promise.all([
            API.getDepartments(),
            API.getCategories(),
            API.getEmployees()
        ]);
        
        await renderOrgView(container, departments, categories, employees);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function renderOrgView(container, departments, categories, employees) {
    container.innerHTML = `
        <div class="card" style="margin-bottom: 24px;">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; border-bottom: 1px solid var(--outline-variant); padding-bottom: 16px; margin-bottom: 24px;">
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; width: 100%; justify-content: flex-start;">
                    <button class="btn ${currentTab === 'DEPARTMENT' && viewMode === 'LIST' ? 'btn-primary' : currentTab === 'DEPARTMENT' && viewMode === 'FORM' ? 'btn-secondary' : 'btn-outline'}" id="tab-dept" style="border-radius: var(--radius-pill); padding: 8px 16px; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-building"></i> DEPARTMENT
                    </button>
                    <button class="btn ${currentTab === 'CATEGORY' && viewMode === 'LIST' ? 'btn-primary' : currentTab === 'CATEGORY' && viewMode === 'FORM' ? 'btn-secondary' : 'btn-outline'}" id="tab-cat" style="border-radius: var(--radius-pill); padding: 8px 16px; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-tags"></i> CATEGORY
                    </button>
                    <button class="btn ${currentTab === 'EMPLOYEE' && viewMode === 'LIST' ? 'btn-primary' : currentTab === 'EMPLOYEE' && viewMode === 'FORM' ? 'btn-secondary' : 'btn-outline'}" id="tab-emp" style="border-radius: var(--radius-pill); padding: 8px 16px; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-users"></i> EMPLOYEE
                    </button>
                    <button class="btn ${viewMode === 'FORM' ? 'btn-primary' : 'btn-outline'}" id="tab-add" style="border-radius: var(--radius-pill); padding: 8px 16px; display: flex; align-items: center; gap: 8px; margin-left: auto;">
                        <i class="fa-solid fa-plus"></i> ADD
                    </button>
                </div>
            </div>
            
            <div id="org-content-container">
                ${viewMode === 'LIST' ? getTableHtml(departments, categories, employees) : getFormHtml(departments, categories, employees)}
            </div>
        </div>
    `;

    // Wire up tab change events
    document.getElementById("tab-dept").onclick = async () => {
        currentTab = "DEPARTMENT";
        viewMode = "LIST";
        await renderOrgView(container, departments, categories, employees);
    };

    document.getElementById("tab-cat").onclick = async () => {
        currentTab = "CATEGORY";
        viewMode = "LIST";
        await renderOrgView(container, departments, categories, employees);
    };

    document.getElementById("tab-emp").onclick = async () => {
        currentTab = "EMPLOYEE";
        viewMode = "LIST";
        await renderOrgView(container, departments, categories, employees);
    };

    document.getElementById("tab-add").onclick = async () => {
        viewMode = "FORM";
        await renderOrgView(container, departments, categories, employees);
    };

    // Wire up form handlers if in FORM view mode
    if (viewMode === 'FORM') {
        const cancelBtn = document.getElementById("btn-form-cancel");
        if (cancelBtn) {
            cancelBtn.onclick = async () => {
                viewMode = "LIST";
                await renderOrgView(container, departments, categories, employees);
            };
        }

        const formEl = document.getElementById("org-add-form");
        if (formEl) {
            formEl.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(formEl);
                const payload = Object.fromEntries(formData.entries());
                
                try {
                    if (currentTab === "DEPARTMENT") {
                        if (payload.parent_department_id) {
                            payload.parent_department_id = parseInt(payload.parent_department_id);
                        } else {
                            delete payload.parent_department_id;
                        }
                        const newDept = await API.createDepartment(payload);
                        departments.push(newDept);
                        showToast("Department created successfully!", "success");
                    } else if (currentTab === "CATEGORY") {
                        const newCat = await API.createCategory(payload);
                        categories.push(newCat);
                        showToast("Category created successfully!", "success");
                    } else if (currentTab === "EMPLOYEE") {
                        payload.department_id = parseInt(payload.department_id);
                        const newEmp = await API.createEmployee(payload);
                        employees.push(newEmp);
                        showToast("Employee registered successfully!", "success");
                    }
                    
                    viewMode = "LIST";
                    await renderOrgView(container, departments, categories, employees);
                } catch (err) {
                    showToast(err.message, "error");
                }
            };
        }
    }
}

function getTableHtml(departments, categories, employees) {
    if (currentTab === "DEPARTMENT") {
        return `
            <div class="table-responsive" style="animation: fadeIn 0.25s ease;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${departments.length === 0 ? '<tr><td colspan="3" style="text-align: center; color: var(--outline);">No departments.</td></tr>' : ''}
                        ${departments.map(d => `
                            <tr>
                                <td style="font-family: var(--font-mono); font-weight: 600;">DEP-${d.id}</td>
                                <td><strong>${d.name}</strong></td>
                                <td><span class="badge ${d.status === 'ACTIVE' ? 'badge-available' : 'badge-lost'}">${d.status}</span></td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } else if (currentTab === "CATEGORY") {
        return `
            <div class="table-responsive" style="animation: fadeIn 0.25s ease;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categories.length === 0 ? '<tr><td colspan="3" style="text-align: center; color: var(--outline);">No categories.</td></tr>' : ''}
                        ${categories.map(c => `
                            <tr>
                                <td style="font-family: var(--font-mono); font-weight: 600;">CAT-${c.id}</td>
                                <td><strong>${c.name}</strong></td>
                                <td><span class="badge ${c.status === 'ACTIVE' ? 'badge-available' : 'badge-lost'}">${c.status}</span></td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } else if (currentTab === "EMPLOYEE") {
        return `
            <div class="table-responsive" style="animation: fadeIn 0.25s ease;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Department</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${employees.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--outline);">No employees.</td></tr>' : ''}
                        ${employees.map(e => {
                            const dept = departments.find(d => d.id === e.department_id);
                            return `
                                <tr>
                                    <td><strong>${e.name}</strong></td>
                                    <td>${e.email}</td>
                                    <td><span class="badge" style="font-family: var(--font-mono); font-size: 11px;">${e.role}</span></td>
                                    <td>${dept ? dept.name : 'Unassigned'}</td>
                                    <td><span class="badge ${e.status === 'ACTIVE' ? 'badge-available' : 'badge-lost'}">${e.status}</span></td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }
    return '';
}

function getFormHtml(departments, categories, employees) {
    if (currentTab === "DEPARTMENT") {
        return `
            <div style="max-width: 600px; margin: 0 auto; padding: 12px 0; animation: fadeIn 0.25s ease;">
                <h3 style="font-size: 20px; font-weight: 700; color: var(--on-background); margin-bottom: 24px;">Create Department</h3>
                <form id="org-add-form" style="display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label class="form-label" for="dept-name">Department Name *</label>
                        <input class="form-control" type="text" id="dept-name" name="name" required placeholder="Engineering & Technology">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="dept-parent">Parent Department</label>
                        <select class="form-control" id="dept-parent" name="parent_department_id">
                            <option value="">None (Top Level)</option>
                            ${departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("")}
                        </select>
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; border-top: 1px solid var(--outline-variant); padding-top: 20px;">
                        <button type="button" class="btn btn-outline" id="btn-form-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Department</button>
                    </div>
                </form>
            </div>
        `;
    } else if (currentTab === "CATEGORY") {
        return `
            <div style="max-width: 600px; margin: 0 auto; padding: 12px 0; animation: fadeIn 0.25s ease;">
                <h3 style="font-size: 20px; font-weight: 700; color: var(--on-background); margin-bottom: 24px;">Create Category</h3>
                <form id="org-add-form" style="display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label class="form-label" for="category-name">Category Name *</label>
                        <input class="form-control" type="text" id="category-name" name="name" required placeholder="IT Hardware">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; border-top: 1px solid var(--outline-variant); padding-top: 20px;">
                        <button type="button" class="btn btn-outline" id="btn-form-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Category</button>
                    </div>
                </form>
            </div>
        `;
    } else if (currentTab === "EMPLOYEE") {
        return `
            <div style="max-width: 600px; margin: 0 auto; padding: 12px 0; animation: fadeIn 0.25s ease;">
                <h3 style="font-size: 20px; font-weight: 700; color: var(--on-background); margin-bottom: 24px;">Hire & Register Employee</h3>
                <form id="org-add-form" style="display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label class="form-label" for="emp-name">Full Name *</label>
                        <input class="form-control" type="text" id="emp-name" name="name" required placeholder="Sarah Connor">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="emp-email">Corporate Email *</label>
                        <input class="form-control" type="email" id="emp-email" name="email" required placeholder="sarah@assetflow.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="emp-pass">Account Password *</label>
                        <input class="form-control" type="password" id="emp-pass" name="password" required placeholder="••••••••">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label class="form-label" for="emp-role">Access Authorization *</label>
                            <select class="form-control" id="emp-role" name="role" required>
                                <option value="STAFF" selected>STAFF (View & Booking)</option>
                                <option value="MANAGER">MANAGER (Approvals & Audits)</option>
                                <option value="ADMIN">ADMIN (Full ERP System)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="emp-dept">Department *</label>
                            <select class="form-control" id="emp-dept" name="department_id" required>
                                ${departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("")}
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; border-top: 1px solid var(--outline-variant); padding-top: 20px;">
                        <button type="button" class="btn btn-outline" id="btn-form-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">Register Employee</button>
                    </div>
                </form>
            </div>
        `;
    }
    return '';
}
