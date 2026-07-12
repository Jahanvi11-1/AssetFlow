import { API } from "../api.js";
import { showToast } from "../app.js";

export async function render(container) {
    try {
        const [assets, departments, maintenanceRequests, bookings] = await Promise.all([
            API.getAssets(),
            API.getDepartments(),
            API.getMaintenance(),
            API.getBookings()
        ]);

        // 1. Process Bar Chart: Utilization by Department
        const utilizationByDept = {};
        departments.forEach(d => {
            utilizationByDept[d.id] = { name: d.name, count: 0 };
        });

        assets.forEach(a => {
            if (a.assigned_department_id && utilizationByDept[a.assigned_department_id]) {
                utilizationByDept[a.assigned_department_id].count++;
            }
        });

        const barData = Object.values(utilizationByDept).map(d => ({
            label: d.name,
            value: d.count
        }));

        // 2. Process Line Chart: Maintenance Frequency (Last 6 Months)
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months.push({ label, key, count: 0 });
        }

        maintenanceRequests.forEach(req => {
            if (!req.created_at) return;
            const reqDate = new Date(req.created_at);
            const key = `${reqDate.getFullYear()}-${String(reqDate.getMonth() + 1).padStart(2, '0')}`;
            const m = months.find(item => item.key === key);
            if (m) {
                m.count++;
            }
        });

        const lineData = months.map(m => ({
            label: m.label,
            value: m.count
        }));

        // 3. Process Card 1: Most Used Assets
        const bookingsByAsset = {};
        bookings.forEach(b => {
            bookingsByAsset[b.asset_id] = (bookingsByAsset[b.asset_id] || 0) + 1;
        });

        const assetsWithUsage = assets.map(a => {
            const allocCount = a.allocations ? a.allocations.length : 0;
            const bookingCount = bookingsByAsset[a.id] || 0;
            const totalUsage = allocCount + bookingCount;
            return { ...a, totalUsage };
        });

        const mostUsed = [...assetsWithUsage]
            .sort((a, b) => b.totalUsage - a.totalUsage)
            .slice(0, 3); // Top 3 as per reference design

        // 4. Process Card 2: Idle Assets
        const idle = assetsWithUsage
            .filter(a => a.status === 'AVAILABLE')
            .sort((a, b) => {
                if (a.totalUsage !== b.totalUsage) {
                    return a.totalUsage - b.totalUsage;
                }
                return new Date(a.acquisition_date) - new Date(b.acquisition_date);
            })
            .slice(0, 3); // Top 3 as per reference design

        // 5. Process Card 3: Assets Due for Maintenance or Retirement
        const today = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        const dueOrRetired = assetsWithUsage.map(a => {
            let isMaint = false;
            let isRetire = false;
            let daysLeft = null;
            let statusText = "";

            if (a.next_maintenance_due) {
                const dueDate = new Date(a.next_maintenance_due);
                const diffTime = dueDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (dueDate <= thirtyDaysFromNow) {
                    isMaint = true;
                    daysLeft = diffDays;
                    statusText = diffDays < 0 ? "Overdue" : (diffDays === 0 ? "Today" : `in ${diffDays} days`);
                }
            }

            const acqDate = new Date(a.acquisition_date);
            const diffTime = today - acqDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const isOld = diffDays > 1095; // > 3 years

            if (a.condition === 'POOR' || a.condition === 'DAMAGED' || isOld) {
                isRetire = true;
            }

            return {
                ...a,
                isMaint,
                isRetire,
                daysLeft,
                statusText,
                isOld
            };
        }).filter(a => a.isMaint || a.isRetire).slice(0, 3); // Top 3 as per reference design

        // Render HTML structure
        container.innerHTML = `
            <style>
                .reports-grid-2 {
                    display: grid;
                    grid-template-columns: 1.3fr 1fr;
                    gap: 24px;
                    margin-bottom: 24px;
                }
                .reports-grid-3 {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 24px;
                    margin-bottom: 24px;
                }
                .premium-card {
                    background: var(--surface);
                    border: 1px solid rgba(199, 199, 185, 0.35);
                    box-shadow: var(--shadow-soft);
                    padding: 24px;
                    border-radius: 18px;
                    display: flex;
                    flex-direction: column;
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
                }
                .premium-card:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-medium);
                }
                @media (max-width: 1024px) {
                    .reports-grid-2 {
                        grid-template-columns: 1fr;
                    }
                    .reports-grid-3 {
                        grid-template-columns: 1fr;
                    }
                }
            </style>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
                <div>
                    <h2 style="font-size: 32px; font-weight: 700; color: var(--on-background); letter-spacing: -0.01em; margin: 0;">Reports & Analytics</h2>
                    <p style="font-size: 16px; color: var(--outline); margin-top: 4px;">Real-time enterprise asset performance and lifecycle tracking.</p>
                </div>
            </div>

            <!-- Two Graphs Section -->
            <div class="reports-grid-2">
                <!-- Department Utilization Bar Chart -->
                <div class="premium-card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                        <div>
                            <h3 style="font-size: 18px; font-weight: 700; color: var(--on-background); margin: 0;">Utilization by Department</h3>
                            <p style="font-size: 13px; color: var(--outline); margin: 4px 0 0 0;">Active asset usage across major business units</p>
                        </div>
                        <span style="background: rgba(90, 99, 52, 0.1); color: var(--primary); font-size: 11px; font-family: var(--font-mono); font-weight: 700; padding: 4px 10px; border-radius: var(--radius-pill);">+12% vs last month</span>
                    </div>
                    <div style="height: 260px; display: flex; align-items: flex-end; justify-content: center; background: transparent;">
                        ${renderBarChartSvg(barData)}
                    </div>
                </div>

                <!-- Maintenance Frequency Line Chart -->
                <div class="premium-card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                        <div>
                            <h3 style="font-size: 18px; font-weight: 700; color: var(--on-background); margin: 0;">Maintenance Frequency</h3>
                            <p style="font-size: 13px; color: var(--outline); margin: 4px 0 0 0;">Scheduled vs unscheduled repairs (Q3)</p>
                        </div>
                    </div>
                    <div style="height: 260px; display: flex; align-items: center; justify-content: center; background: transparent; position: relative;">
                        ${renderLineChartSvg(lineData)}
                        <div style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span style="font-size: 28px; font-weight: 800; color: var(--tertiary); line-height: 1;">2.4x</span>
                            <span style="font-size: 9px; font-family: var(--font-mono); text-transform: uppercase; color: var(--outline); letter-spacing: 0.05em; margin-top: 4px;">Reliability Score</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Three Analytical Cards Section -->
            <div class="reports-grid-3">
                <!-- Most Used Assets -->
                <div class="premium-card">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
                        <div style="padding: 8px; background: rgba(90, 99, 52, 0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-arrow-trend-up" style="color: var(--primary); font-size: 16px;"></i>
                        </div>
                        <h3 style="font-size: 16px; font-weight: 700; color: var(--on-background); margin: 0;">Most Used Assets</h3>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${mostUsed.length === 0 ? '<p style="color: var(--outline); text-align: center; padding: 16px;">No usage data logged.</p>' : ''}
                        ${mostUsed.map(a => `
                            <div style="display: flex; flex-direction: column; padding: 12px 16px; background: var(--surface-container-low); border-radius: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span style="font-weight: 700; font-size: 14px; color: var(--on-background);">${a.name}</span>
                                    <span style="font-weight: 700; font-size: 13px; color: var(--primary);">${a.totalUsage} Uses</span>
                                </div>
                                <div style="font-size: 12px; color: var(--outline); font-family: var(--font-mono);">${a.asset_tag} &bull; ${a.location}</div>
                            </div>
                        `).join("")}
                    </div>
                </div>

                <!-- Idle Assets -->
                <div class="premium-card">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
                        <div style="padding: 8px; background: rgba(209, 199, 183, 0.25); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-circle-pause" style="color: var(--outline); font-size: 16px;"></i>
                        </div>
                        <h3 style="font-size: 16px; font-weight: 700; color: var(--on-background); margin: 0;">Idle Assets</h3>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${idle.length === 0 ? '<p style="color: var(--outline); text-align: center; padding: 16px;">No idle assets found.</p>' : ''}
                        ${idle.map(a => `
                            <div style="display: flex; flex-direction: column; padding: 12px 16px; border: 1px solid rgba(199, 199, 185, 0.4); border-radius: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span style="font-weight: 700; font-size: 14px; color: var(--on-background);">${a.name}</span>
                                    <span style="font-weight: 700; font-size: 13px; color: var(--status-error);">${a.totalUsage} Uses</span>
                                </div>
                                <div style="font-size: 12px; color: var(--outline); font-family: var(--font-mono);">${a.asset_tag} &bull; Acquired ${a.acquisition_date}</div>
                            </div>
                        `).join("")}
                    </div>
                </div>

                <!-- Assets Due for Maintenance or Retirement -->
                <div class="premium-card">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
                        <div style="padding: 8px; background: rgba(224, 153, 118, 0.15); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-screwdriver-wrench" style="color: var(--tertiary); font-size: 16px;"></i>
                        </div>
                        <h3 style="font-size: 16px; font-weight: 700; color: var(--on-background); margin: 0;">Maintenance & Retirement</h3>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${dueOrRetired.length === 0 ? '<p style="color: var(--outline); text-align: center; padding: 16px;">All assets healthy.</p>' : ''}
                        ${dueOrRetired.map(a => {
            if (a.isMaint) {
                return `
                                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(137, 80, 50, 0.05); border-left: 4px solid var(--tertiary); border-radius: 12px;">
                                        <div>
                                            <div style="font-weight: 700; font-size: 14px; color: var(--on-background);">${a.name}</div>
                                            <div style="font-size: 12px; color: var(--outline); font-family: var(--font-mono);">${a.asset_tag} &bull; Maint. Due</div>
                                        </div>
                                        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                            <span style="font-weight: 700; font-size: 13px; color: var(--tertiary);">${a.statusText}</span>
                                            <span style="font-size: 9px; font-weight: 700; font-family: var(--font-mono); background: rgba(137, 80, 50, 0.15); color: var(--tertiary); padding: 2px 6px; border-radius: var(--radius-sm);">PRIORITY</span>
                                        </div>
                                    </div>
                                `;
            } else {
                let reason = a.isOld ? "Aged (>3 yr)" : (a.condition === 'DAMAGED' ? "Damaged" : "Poor Condition");
                return `
                                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(209, 199, 183, 0.2); border-radius: 12px;">
                                        <div>
                                            <div style="font-weight: 700; font-size: 14px; color: var(--on-background);">${a.name}</div>
                                            <div style="font-size: 12px; color: var(--outline); font-family: var(--font-mono);">${a.asset_tag} &bull; ${reason}</div>
                                        </div>
                                        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                            <span style="font-weight: 700; font-size: 13px; color: var(--on-background);">Phase out</span>
                                            <span style="font-size: 9px; font-weight: 700; font-family: var(--font-mono); background: rgba(119, 120, 107, 0.15); color: var(--on-background); padding: 2px 6px; border-radius: var(--radius-sm);">PLAN</span>
                                        </div>
                                    </div>
                                `;
            }
        }).join("")}
                    </div>
                </div>
            </div>

            <!-- Export Section -->
            <div style="display: flex; justify-content: flex-end; margin-top: 32px; padding-bottom: 24px;">
                <button class="btn btn-secondary" id="btn-export-report" style="border-radius: 12px; padding: 12px 28px; display: flex; align-items: center; gap: 10px; font-weight: 600; box-shadow: 0 4px 12px rgba(137, 80, 50, 0.15); cursor: pointer;">
                    <i class="fa-solid fa-download"></i> Export Complete Report
                </button>
            </div>
        `;

        // Wire up export button click
        document.getElementById("btn-export-report").onclick = () => {
            let csvText = "ASSETFLOW ENTERPRISE - SYSTEMS REPORT SUMMARY\n";
            csvText += `Generated At,${new Date().toISOString()}\n\n`;

            // Department utilization
            csvText += "DEPARTMENT UTILIZATION SUMMARY\n";
            csvText += "Department,Allocated Assets Count\n";
            barData.forEach(d => {
                csvText += `"${d.label.replace(/"/g, '""')}",${d.value}\n`;
            });
            csvText += "\n";

            // Maintenance frequency
            csvText += "MAINTENANCE REQUEST FREQUENCY\n";
            csvText += "Month,Requests Raised\n";
            lineData.forEach(d => {
                csvText += `"${d.label}",${d.value}\n`;
            });
            csvText += "\n";

            // Most used assets
            csvText += "MOST USED ASSETS\n";
            csvText += "Asset Tag,Name,Location,Total Uses\n";
            mostUsed.forEach(a => {
                csvText += `"${a.asset_tag}","${a.name.replace(/"/g, '""')}","${a.location.replace(/"/g, '""')}",${a.totalUsage}\n`;
            });
            csvText += "\n";

            // Idle assets
            csvText += "IDLE ASSETS (AVAILABLE)\n";
            csvText += "Asset Tag,Name,Location,Acquisition Date,Total Uses\n";
            idle.forEach(a => {
                csvText += `"${a.asset_tag}","${a.name.replace(/"/g, '""')}","${a.location.replace(/"/g, '""')}","${a.acquisition_date}",${a.totalUsage}\n`;
            });
            csvText += "\n";

            // Maintenance/retirement alert assets
            csvText += "URGENT ACTION ASSETS\n";
            csvText += "Asset Tag,Name,Condition,Next Maintenance Due,Acquisition Date\n";
            dueOrRetired.forEach(a => {
                csvText += `"${a.asset_tag}","${a.name.replace(/"/g, '""')}","${a.condition}","${a.next_maintenance_due || 'N/A'}","${a.acquisition_date}"\n`;
            });

            // Blob-based download
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `AssetFlow_Enterprise_Report_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast("Report exported successfully!", "success");
        };

    } catch (err) {
        showToast(err.message, "error");
    }
}

function renderBarChartSvg(data) {
    if (data.length === 0) {
        return `<p style="color: var(--outline);">No data available.</p>`;
    }
    const width = 500;
    const height = 240;
    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;

    const maxVal = Math.max(...data.map(d => d.value), 4);
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const barWidth = Math.max(10, (chartWidth / data.length) * 0.6);
    const barSpacing = (chartWidth / data.length) * 0.4;

    let svgHtml = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; overflow: visible;">`;

    // Draw Y-axis gridlines & labels
    const gridLinesCount = 4;
    for (let i = 0; i <= gridLinesCount; i++) {
        const val = Math.round((maxVal / gridLinesCount) * i);
        const y = height - paddingBottom - (chartHeight / gridLinesCount) * i;
        svgHtml += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="var(--outline-variant)" stroke-width="1" stroke-dasharray="4 4" opacity="0.5" />
            <text x="${paddingLeft - 10}" y="${y + 4}" fill="var(--outline)" font-size="10" font-family="var(--font-sans)" text-anchor="end">${val}</text>
        `;
    }

    // Draw X-axis
    svgHtml += `<line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="var(--outline)" stroke-width="1.5" />`;

    // Draw Bars
    data.forEach((d, idx) => {
        const x = paddingLeft + (idx * (chartWidth / data.length)) + (barSpacing / 2);
        const barHeight = d.value > 0 ? (d.value / maxVal) * chartHeight : 0;
        const y = height - paddingBottom - barHeight;

        svgHtml += `
            <g class="bar-group" style="cursor: pointer;">
                <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="var(--primary)" rx="6" ry="6">
                    <title>${d.label}: ${d.value} assets</title>
                </rect>
                <text x="${x + barWidth / 2}" y="${height - paddingBottom + 18}" fill="var(--on-background)" font-size="10" font-family="var(--font-sans)" text-anchor="middle">${d.label}</text>
                ${d.value > 0 ? `<text x="${x + barWidth / 2}" y="${y - 6}" fill="var(--primary)" font-weight="700" font-size="11" font-family="var(--font-mono)" text-anchor="middle">${d.value}</text>` : ''}
            </g>
        `;
    });

    svgHtml += `</svg>`;
    return svgHtml;
}

function renderLineChartSvg(data) {
    if (data.length === 0) {
        return `<p style="color: var(--outline);">No data available.</p>`;
    }
    const width = 500;
    const height = 240;
    const paddingLeft = 50;
    const paddingRight = 30;
    const paddingTop = 20;
    const paddingBottom = 40;

    const maxVal = Math.max(...data.map(d => d.value), 4);
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    let svgHtml = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; overflow: visible;">`;

    // Draw Y-axis gridlines & labels
    const gridLinesCount = 4;
    for (let i = 0; i <= gridLinesCount; i++) {
        const val = Math.round((maxVal / gridLinesCount) * i);
        const y = height - paddingBottom - (chartHeight / gridLinesCount) * i;
        svgHtml += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="var(--outline-variant)" stroke-width="1" stroke-dasharray="4 4" opacity="0.5" />
            <text x="${paddingLeft - 10}" y="${y + 4}" fill="var(--outline)" font-size="10" font-family="var(--font-sans)" text-anchor="end">${val}</text>
        `;
    }

    // Draw X-axis
    svgHtml += `<line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="var(--outline)" stroke-width="1.5" />`;

    // Compute line path points
    const points = data.map((d, idx) => {
        const x = paddingLeft + (idx * (chartWidth / (data.length - 1 || 1)));
        const y = height - paddingBottom - (d.value / maxVal) * chartHeight;
        return { x, y, val: d.value, label: d.label };
    });

    // Draw line
    if (points.length > 1) {
        const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(" ");
        svgHtml += `<path d="${pathD}" fill="none" stroke="var(--tertiary)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />`;

        // Draw Area under the line
        const areaD = `${points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(" ")} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;
        svgHtml += `<path d="${areaD}" fill="var(--tertiary)" fill-opacity="0.08" />`;
    }

    // Draw Points & Labels
    points.forEach(p => {
        svgHtml += `
            <g class="point-group" style="cursor: pointer;">
                <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--surface)" stroke="var(--tertiary)" stroke-width="2.5">
                    <title>${p.label}: ${p.val} requests</title>
                </circle>
                <text x="${p.x}" y="${height - paddingBottom + 18}" fill="var(--on-background)" font-size="10" font-family="var(--font-sans)" text-anchor="middle">${p.label}</text>
                ${p.val > 0 ? `<text x="${p.x}" y="${p.y - 8}" fill="var(--tertiary)" font-weight="700" font-size="11" font-family="var(--font-mono)" text-anchor="middle">${p.val}</text>` : ''}
            </g>
        `;
    });

    svgHtml += `</svg>`;
    return svgHtml;
}
