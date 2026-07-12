import { API } from "../api.js";
import { showToast, clearCachedProfile } from "../app.js";

export async function render(container) {
    container.innerHTML = `
        <div id="login-layout">
            <div class="login-card">
                <div class="login-header">
                    <div class="logo-icon" style="width: 48px; height: 48px; font-size: 20px; margin: 0 auto 16px;">AF</div>
                    <h2 class="login-title">AssetFlow Enterprise</h2>
                    <p class="login-subtitle">Sign in to manage corporate resources</p>
                </div>
                <form id="login-form" style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="form-group">
                        <label class="form-label" for="login-email">Email Address</label>
                        <input class="form-control" type="email" id="login-email" name="email" required placeholder="alice@assetflow.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="login-password">Password</label>
                        <input class="form-control" type="password" id="login-password" name="password" required placeholder="••••••••">
                    </div>
                    <button class="btn btn-primary" type="submit" style="width: 100%; padding: 12px; margin-top: 8px;">
                        <i class="fa-solid fa-right-to-bracket"></i> Sign In
                    </button>
                </form>
                <div style="margin-top: 24px; text-align: center; font-size: 13px; color: var(--outline);">
                    <p>Demo accounts:</p>
                    <p style="font-family: var(--font-mono); margin-top: 4px;">Admin: alice@assetflow.com / Password123</p>
                    <p style="font-family: var(--font-mono);">Manager: priya@assetflow.com / Password123</p>
                    <p style="font-family: var(--font-mono);">Staff: raj@assetflow.com / Password123</p>
                </div>
            </div>
        </div>
    `;

    const form = document.getElementById("login-form");
    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        
        try {
            await API.login(email, password);
            clearCachedProfile(); // Force reload user info
            showToast("Welcome back to AssetFlow!", "success");
            window.location.hash = "#/dashboard";
        } catch (err) {
            showToast(err.message || "Invalid email or password", "error");
        }
    };
}
