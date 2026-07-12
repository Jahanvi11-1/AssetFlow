import { API } from "../api.js";
import { showToast } from "../app.js";

export async function render(container) {
    try {
        const data = await API.getDashboardOverview();
        const kpis = data.kpis;
        const activities = data.recent_activities;

        // Fetch categories to show utilization rate
        const categories = await API.getCategories();
        const assets = await API.getAssets();

        container.innerHTML = `
            <div class="card" style="margin-bottom: 24px; padding: 20px 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="font-size: 15px; font-weight: 700; color: var(--on-background); text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-mono);"><i class="fa-solid fa-bolt" style="color: var(--primary); margin-right: 6px;"></i> Quick Handover Actions</h3>
                    <span style="font-size: 11px; color: var(--outline); font-family: var(--font-mono);">SHORTCUTS</span>
                </div>
                <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="window.location.hash='#/assets?action=assets'" style="flex: 1; min-width: 180px; font-weight: 600;">
                        <i class="fa-solid fa-plus"></i> Register Asset
                    </button>
                    <button class="btn btn-secondary" onclick="window.location.hash='#/bookings'" style="flex: 1; min-width: 180px; font-weight: 600;">
                        <i class="fa-solid fa-calendar-plus"></i> Book Resource
                    </button>
                    <button class="btn btn-outline" onclick="window.location.hash='#/maintenance?action=report'" style="flex: 1; min-width: 180px; font-weight: 600; border-color: var(--tertiary); color: var(--tertiary);">
                        <i class="fa-solid fa-screwdriver-wrench"></i> Raise Request
                    </button>
                </div>
            </div>

            <div class="kpi-grid">
                <div class="kpi-card">
                    <span class="kpi-label">Available Assets</span>
                    <span class="kpi-value">${kpis.available_assets}</span>
                </div>
                <div class="kpi-card">
                    <span class="kpi-label">Allocated Assets</span>
                    <span class="kpi-value">${kpis.allocated_assets}</span>
                </div>
                <div class="kpi-card accent">
                    <span class="kpi-label">Active Bookings</span>
                    <span class="kpi-value">${kpis.active_bookings}</span>
                </div>
                <div class="kpi-card accent">
                    <span class="kpi-label">Maintenance Today</span>
                    <span class="kpi-value">${kpis.maintenance_today}</span>
                </div>
                <div class="kpi-card">
                    <span class="kpi-label">Pending Transfers</span>
                    <span class="kpi-value">${kpis.pending_transfers}</span>
                </div>
                <div class="kpi-card">
                    <span class="kpi-label">Upcoming Returns</span>
                    <span class="kpi-value">${kpis.upcoming_returns}</span>
                </div>
            </div>

            <div class="dashboard-panels">
                <!-- Recent Activities Panel -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Recent Activity Feed</h3>
                        <a href="#/logs" class="btn btn-text">View All Logs</a>
                    </div>
                    <div class="timeline" id="timeline-container">
                        ${activities.length === 0 ? '<p style="color: var(--outline); font-size: 14px;">No recent activities logged.</p>' : ''}
                        ${activities.slice(0, 5).map(act => {
            let icon = "fa-circle-info";
            if (act.type === "ALLOCATION") icon = "fa-right-left";
            if (act.type === "MAINTENANCE") icon = "fa-screwdriver-wrench";
            if (act.type === "BOOKING") icon = "fa-calendar-check";
            if (act.type === "TRANSFER") icon = "fa-truck-ramp-box";
            if (act.type === "AUDIT") icon = "fa-clipboard-check";

            const dateStr = new Date(act.timestamp).toLocaleString();
            return `
                                <div class="timeline-item">
                                    <div class="timeline-icon">
                                        <i class="fa-solid ${icon}"></i>
                                    </div>
                                    <div class="timeline-content">
                                        <div class="timeline-header">
                                            <span class="timeline-title">${act.title}</span>
                                            <span class="timeline-time">${dateStr}</span>
                                        </div>
                                        <p class="timeline-desc">${act.message}</p>
                                    </div>
                                </div>
                            `;
        }).join("")}
                    </div>
                </div>

                <!-- Asset Utilization Card -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Category Utilization</h3>
                    </div>
                    <div class="utilization-list">
                        ${categories.map(cat => {
            const catAssets = assets.filter(a => a.category_id === cat.id);
            const total = catAssets.length;
            const allocated = catAssets.filter(a => a.status === "ALLOCATED" || a.status === "RESERVED").length;
            const rate = total > 0 ? Math.round((allocated / total) * 100) : 0;

            return `
                                <div class="progress-wrapper">
                                    <div class="progress-labels">
                                        <span style="font-weight: 600;">${cat.name}</span>
                                        <span style="font-family: var(--font-mono); color: var(--outline);">${allocated} / ${total} (${rate}%)</span>
                                    </div>
                                    <div class="progress-bar-bg">
                                        <div class="progress-bar-fill" style="width: ${rate}%;"></div>
                                    </div>
                                </div>
                            `;
        }).join("")}
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        showToast(err.message, "error");
    }
}
