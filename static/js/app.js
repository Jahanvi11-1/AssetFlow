import { Auth, API } from "./api.js";

// Global Toast Handler
export function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "fa-circle-check";
    if (type === "error") icon = "fa-circle-exclamation";
    if (type === "info") icon = "fa-circle-info";
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Automatically fade out and remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = "slideIn 0.3s reverse ease forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Global Modal Handler
let modalConfirmCallback = null;
export function showModal({ title, bodyHtml, onConfirm, confirmText = "Confirm" }) {
    const overlay = document.getElementById("modal-container-overlay");
    const titleEl = document.getElementById("global-modal-title");
    const bodyEl = document.getElementById("global-modal-body-content");
    const submitBtn = document.getElementById("global-modal-submit");
    
    if (!overlay || !bodyEl) return;
    
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    submitBtn.textContent = confirmText;
    
    modalConfirmCallback = onConfirm;
    
    overlay.classList.add("show");
}

export function closeModal() {
    const overlay = document.getElementById("modal-container-overlay");
    if (overlay) {
        overlay.classList.remove("show");
    }
    modalConfirmCallback = null;
}

// Close events for Modal
document.getElementById("global-modal-close-btn").onclick = closeModal;
document.getElementById("global-modal-cancel").onclick = closeModal;
document.getElementById("global-modal-submit").onclick = async () => {
    if (modalConfirmCallback) {
        const form = document.getElementById("global-modal-body-content").querySelector("form");
        let payload = null;
        if (form) {
            const formData = new FormData(form);
            payload = Object.fromEntries(formData.entries());
        }
        
        try {
            await modalConfirmCallback(payload);
            closeModal();
        } catch (err) {
            showToast(err.message, "error");
        }
    }
};

// Route definitions matching the dynamic view scripts
const ROUTES = {
    "#/login": "./views/login.js",
    "#/dashboard": "./views/dashboard.js",
    "#/assets": "./views/assets.js",
    "#/allocations": "./views/allocations.js",
    "#/bookings": "./views/bookings.js",
    "#/maintenance": "./views/maintenance.js",
    "#/audits": "./views/audits.js",
    "#/reports": "./views/reports.js",
    "#/org": "./views/org.js",
    "#/logs": "./views/logs.js"
};

// Router Logic
async function handleRouting() {
    let hash = window.location.hash || "#/dashboard";
    const path = hash.split("?")[0];
    
    // Auth Check
    if (!Auth.isAuthenticated()) {
        if (path !== "#/login") {
            window.location.hash = "#/login";
            return;
        }
    } else if (path === "#/login") {
        window.location.hash = "#/dashboard";
        return;
    }
    
    const viewPath = ROUTES[path];
    if (!viewPath) {
        showToast("Page not found", "error");
        window.location.hash = "#/dashboard";
        return;
    }
    
    // Toggle Layout Visibility based on Login Page
    const sidebar = document.getElementById("sidebar");
    const topBar = document.getElementById("top-bar");
    const canvas = document.getElementById("content-canvas");
    
    if (path === "#/login") {
        sidebar.style.display = "none";
        topBar.style.display = "none";
    } else {
        sidebar.style.display = "flex";
        topBar.style.display = "flex";
        
        // Render Active Nav indicator
        document.querySelectorAll(".nav-item").forEach(el => {
            el.classList.toggle("active", el.getAttribute("href") === path);
        });
        
        // Update Title Label
        const activeNav = document.querySelector(`.nav-item[href="${path}"]`);
        if (activeNav) {
            document.getElementById("page-title-label").textContent = activeNav.querySelector("span").textContent;
        }
        
        // Refresh User Info if needed
        await loadUserProfile();
    }
    
    // Show Loading Spinner
    canvas.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
            <i class="fa-solid fa-spinner fa-spin fa-2xl" style="color: var(--primary); margin-bottom: 16px;"></i>
            <p style="font-weight: 500; color: var(--outline);">Loading...</p>
        </div>
    `;
    
    try {
        const module = await import(`${viewPath}?v=${Date.now()}`);
        await module.render(canvas);
    } catch (err) {
        console.error("View loading error", err);
        canvas.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--error);">
                <i class="fa-solid fa-circle-exclamation fa-2xl" style="margin-bottom: 16px;"></i>
                <p style="font-weight: 600;">Failed to load view</p>
                <p style="font-size: 13px; color: var(--outline); margin-top: 8px;">${err.message}</p>
            </div>
        `;
    }
}

// User Profile loading
let currentUser = null;
async function loadUserProfile() {
    if (currentUser) return;
    try {
        currentUser = await API.getMe();
        document.getElementById("profile-name").textContent = currentUser.name;
        document.getElementById("profile-role").textContent = currentUser.role;
        document.getElementById("profile-avatar").textContent = currentUser.name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
        
        // Check for unread notifications
        const logs = await API.getSystemLogs(false);
        const unread = logs.filter(log => !log.is_read);
        document.getElementById("unread-notifications-dot").style.display = unread.length > 0 ? "block" : "none";
    } catch (err) {
        console.error("Failed to load user profile", err);
    }
}

export function clearCachedProfile() {
    currentUser = null;
}

// Wire up logout button
document.getElementById("btn-logout").onclick = () => {
    Auth.clearToken();
    clearCachedProfile();
    window.location.hash = "#/login";
    showToast("Logged out successfully", "info");
};

// Listeners
window.addEventListener("hashchange", handleRouting);
window.addEventListener("DOMContentLoaded", handleRouting);
