import { API } from "../api.js";
import { showToast } from "../app.js";

export async function render(container) {
    try {
        const logs = await API.getSystemLogs(true);
        
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fa-solid fa-list"></i> System Activity & Change Log</h3>
                </div>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Category</th>
                                <th>Activity Title</th>
                                <th>Description / Change Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: var(--outline);">No log messages registered yet.</td></tr>' : ''}
                            ${logs.map(log => {
                                const timeStr = new Date(log.timestamp).toLocaleString();
                                return `
                                    <tr>
                                        <td style="font-family: var(--font-mono); font-size: 13px; white-space: nowrap;">${timeStr}</td>
                                        <td><span class="badge" style="font-family: var(--font-mono); font-size: 11px;">${log.type}</span></td>
                                        <td><strong>${log.title}</strong></td>
                                        <td style="font-size: 13px; color: var(--on-background);">${log.message}</td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        // Disable the unread alert notification dot on top-bar when visited
        const dot = document.getElementById("unread-notifications-dot");
        if (dot) dot.style.display = "none";
        
    } catch (err) {
        showToast(err.message, "error");
    }
}
