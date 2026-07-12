// API client interface for the AssetFlow application
const BASE_URL = ""; // Served from the same host

// Helper to manage credentials
export const Auth = {
    getToken() {
        return localStorage.getItem("assetflow_token");
    },
    setToken(token) {
        localStorage.setItem("assetflow_token", token);
    },
    clearToken() {
        localStorage.removeItem("assetflow_token");
    },
    isAuthenticated() {
        return !!this.getToken();
    }
};

// Generic fetch wrapper
async function request(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };
    
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    
    const config = {
        ...options,
        headers
    };
    
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, config);
        
        // Handle no content
        if (response.status === 204) {
            return null;
        }
        
        const data = await response.json().catch(() => ({}));
        
        if (!response.ok) {
            // Throw custom API error
            const error = new Error(data.detail || "API Request Failed");
            error.status = response.status;
            error.detail = data.detail;
            throw error;
        }
        
        return data;
    } catch (err) {
        if (err.status === 401) {
            Auth.clearToken();
            // Trigger redirect to login
            window.location.hash = "#/login";
        }
        throw err;
    }
}

// Export API helper methods
export const API = {
    // Auth Endpoints
    async login(email, password) {
        // FastAPI OAuth2 uses Form data but we added a JSON login endpoint too.
        // Let's check our auth router:
        // router.post("/auth/login") acceptsLoginRequest (email, password) as JSON.
        const res = await request("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });
        Auth.setToken(res.access_token);
        return res;
    },
    
    async getMe() {
        return request("/auth/me");
    },
    
    // Employee & Departments
    async getEmployees() {
        return request("/employees");
    },
    
    async createEmployee(payload) {
        return request("/employees", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    async getDepartments() {
        return request("/departments");
    },
    
    async createDepartment(payload) {
        return request("/departments", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    // Categories & Assets
    async getCategories() {
        return request("/categories");
    },
    
    async createCategory(payload) {
        return request("/categories", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    async getAssets(query = "") {
        const path = query ? `/assets?q=${encodeURIComponent(query)}` : "/assets";
        return request(path);
    },
    
    async getAsset(id) {
        return request(`/assets/${id}`);
    },
    
    async createAsset(payload) {
        return request("/assets", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    // Allocations & Transfers
    async allocateAsset(id, payload) {
        return request(`/assets/${id}/allocate`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    async returnAsset(id, payload) {
        return request(`/assets/${id}/return`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    async getTransfers() {
        return request("/transfers");
    },
    
    async createTransfer(payload) {
        return request("/transfers", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    async actionTransfer(id, payload) {
        return request(`/transfers/${id}/action`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    },
    
    // Resource Bookings
    async getBookings() {
        return request("/bookings");
    },
    
    async createBooking(payload) {
        return request("/bookings", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    // Maintenance Kanban
    async getMaintenance() {
        return request("/maintenance");
    },
    
    async createMaintenance(payload) {
        return request("/maintenance", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    async updateMaintenanceStatus(id, payload) {
        return request(`/maintenance/${id}/status`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    },
    
    // Audit Cycles
    async getAuditCycles() {
        return request("/audits/cycles");
    },
    
    async createAuditCycle(payload) {
        return request("/audits/cycles", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    
    async updateAuditCycleStatus(id, status_val) {
        return request(`/audits/cycles/${id}/status?status_val=${status_val}`, {
            method: "PUT"
        });
    },
    
    async getAuditItems(cycleId) {
        return request(`/audits/cycles/${cycleId}/items`);
    },
    
    async updateAuditItem(itemId, payload) {
        return request(`/audits/items/${itemId}`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    },
    
    async closeAuditCycle(cycleId) {
        return request(`/audits/cycles/${cycleId}/close`, {
            method: "PUT"
        });
    },
    
    // Dashboard & Logs
    async getDashboardOverview() {
        return request("/dashboard/overview");
    },
    
    async getSystemLogs(markRead = false) {
        const path = markRead ? "/dashboard/logs?mark_read=true" : "/dashboard/logs";
        return request(path);
    }
};
