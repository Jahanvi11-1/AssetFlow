import { API } from "../api.js";
import { showToast } from "../app.js";

export async function render(container) {
    try {
        const [assets, bookings] = await Promise.all([
            API.getAssets(),
            API.getBookings()
        ]);

        // Filter assets that are marked as bookable / shared resources
        const sharedAssets = assets.filter(a => a.is_shared);

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 24px;">
                <!-- Booking Reservation Form -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fa-solid fa-calendar-check"></i> Book Shared Resource</h3>
                    </div>
                    <form id="booking-create-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label class="form-label" for="book-asset">Select Shared Resource *</label>
                            <select class="form-control" id="book-asset" name="asset_id" required>
                                <option value="">-- Choose Resource --</option>
                                ${sharedAssets.map(a => `<option value="${a.id}">${a.asset_tag} - ${a.name} (${a.location})</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="book-start">Start Time *</label>
                            <input class="form-control" type="datetime-local" id="book-start" name="start_time" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="book-end">End Time *</label>
                            <input class="form-control" type="datetime-local" id="book-end" name="end_time" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="book-purpose">Purpose</label>
                            <input class="form-control" type="text" id="book-purpose" name="purpose" placeholder="Team standup, Client presentation, etc.">
                        </div>
                        <button class="btn btn-primary" type="submit" style="align-self: flex-start; margin-top: 8px;">
                            Reserve Slot
                        </button>
                    </form>
                </div>

                <!-- Schedule Calendar Timeline -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fa-solid fa-calendar-days"></i> Upcoming Resource Schedule</h3>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Resource</th>
                                    <th>Time Interval</th>
                                    <th>Status</th>
                                    <th>Purpose</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bookings.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: var(--outline);">No upcoming resource bookings.</td></tr>' : ''}
                                ${bookings.map(bk => {
                                    const asset = assets.find(a => a.id === bk.asset_id);
                                    const assetTag = asset ? asset.asset_tag : "Asset";
                                    const assetName = asset ? asset.name : "Resource";
                                    
                                    const startStr = new Date(bk.start_time).toLocaleString(undefined, {
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    });
                                    const endStr = new Date(bk.end_time).toLocaleString(undefined, {
                                        hour: '2-digit', minute: '2-digit'
                                    });
                                    
                                    return `
                                        <tr>
                                            <td>
                                                <div style="font-weight: 600;">${assetTag}</div>
                                                <div style="font-size: 12px; color: var(--outline);">${assetName}</div>
                                            </td>
                                            <td style="font-size: 13px; font-family: var(--font-mono);">
                                                ${startStr} - ${endStr}
                                            </td>
                                            <td><span class="badge badge-${bk.status.toLowerCase()}">${bk.status}</span></td>
                                            <td style="font-size: 13px; color: var(--outline);">${bk.purpose || 'No purpose listed'}</td>
                                        </tr>
                                    `;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Pre-fill date values to next hour
        const now = new Date();
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        
        const start = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
        const end = new Date(start.getTime() + 60 * 60 * 1000); // +2 hours
        
        // Convert to timezone offset ISO string
        const offset = now.getTimezoneOffset() * 60000;
        document.getElementById("book-start").value = new Date(start.getTime() - offset).toISOString().slice(0, 16);
        document.getElementById("book-end").value = new Date(end.getTime() - offset).toISOString().slice(0, 16);

        // Submit form handler
        document.getElementById("booking-create-form").onsubmit = async (e) => {
            e.preventDefault();
            const assetId = parseInt(document.getElementById("book-asset").value);
            
            // Format time inputs to ISO string UTC
            const startTimeLocal = document.getElementById("book-start").value;
            const endTimeLocal = document.getElementById("book-end").value;
            
            const startISO = new Date(startTimeLocal).toISOString();
            const endISO = new Date(endTimeLocal).toISOString();
            
            const purpose = document.getElementById("book-purpose").value;

            try {
                await API.createBooking({
                    asset_id: assetId,
                    start_time: startISO,
                    end_time: endISO,
                    purpose: purpose
                });
                showToast("Resource reservation created successfully!", "success");
                await render(container);
            } catch (err) {
                showToast(err.message, "error");
            }
        };

    } catch (err) {
        showToast(err.message, "error");
    }
}
