# AssetFlow Enterprise - Asset & Resource Management System

AssetFlow is a production-ready, full-stack ERP web application designed to track and manage enterprise assets, schedule shared resources, handle equipment maintenance workflows, and perform stocktake audits.

The user interface implements the Stitch **"Warm Corporate"** design system, utilizing a warm cream canvas background, sleek typography (Hanken Grotesk and JetBrains Mono), pill-shaped components, and micro-interactive elements.

---

## 🚀 Key Features

1. **Asset Registry & Details:** Searchable database table of corporate assets tracking condition status (NEW, GOOD, FAIR, POOR, DAMAGED), location codes, and acquisition valuations.
2. **Double-Allocation Block:** Core safety guard preventing physical assets (like laptops or chairs) from being checked out to multiple individuals simultaneously. Shows immediate conflict error messages detailing who holds the asset.
3. **Resource Scheduler & Overlap Guard:** Booking module for shared resources (desks, conference rooms, vehicles). Implements strict SQL/FastAPI overlap logic blocking conflicting reservations.
4. **Maintenance Kanban Board:** Interactive maintenance ticket manager supporting the full repair cycle (`PENDING` ➔ `APPROVED` ➔ `TECHNICIAN ASSIGNED` ➔ `IN PROGRESS` ➔ `RESOLVED`). Reverts asset to `AVAILABLE` upon resolution.
5. **Stocktake Audit Cycles:** Plan and schedule site-wide or department audits. Closing active audits automatically transitions any missing assets to `LOST` in the registry.
6. **Analytics Reports:** Real-time capitalization expenditures, location density maps, and asset physical health statistics.
7. **Organization Panel:** Allows administrators to register departments and add new employees with role-based access control (ADMIN, MANAGER, STAFF).

---

## 🛠️ Technology Stack

- **Backend API:** FastAPI (Python 3.13)
- **Database ORM:** SQLAlchemy v2.0 (fully asynchronous queries with `asyncpg`)
- **Validation:** Pydantic v2
- **Database Engine:** PostgreSQL
- **Frontend client:** Single Page Application (SPA) using HTML5, Vanilla CSS3, and ES6 Javascript Modules (no heavy external build-steps or frameworks required).
- **Icons:** FontAwesome v6.4

---

## 📁 Directory Structure

```text
AssestFlow/
│
├── static/                   # Frontend SPA client files
│   ├── css/
│   │   └── styles.css        # Warm Corporate custom variables & styling
│   ├── js/
│   │   ├── views/            # Route modules representing dynamic pages
│   │   │   ├── login.js
│   │   │   ├── dashboard.js
│   │   │   ├── assets.js
│   │   │   ├── allocations.js
│   │   │   ├── bookings.js
│   │   │   ├── maintenance.js
│   │   │   ├── audits.js
│   │   │   ├── reports.js
│   │   │   ├── org.js
│   │   │   └── logs.js
│   │   ├── api.js            # REST API client wrapper & auth manager
│   │   └── app.js            # SPA Hash router and global modal controllers
│   └── index.html            # Core HTML application shell & sidebar Layout
│
├── routers/                  # FastAPI router endpoints
│   ├── auth.py
│   ├── assets.py
│   ├── bookings.py
│   ├── maintenance.py
│   ├── audits.py
│   └── dashboard.py
│
├── database.py               # Async engine and session setup
├── models.py                 # SQLAlchemy declarative models & tables mapping
├── schemas.py                # Pydantic validation schemas
├── main.py                   # FastAPI app declaration & static mount
├── seed.py                   # Initial database seeder script
├── run.py                    # Uvicorn entry launcher
└── verify_backend.py         # End-to-end integration test suite
```

---

## ⚙️ Installation & Database Setup

### 1. PostgreSQL Database Configuration
Make sure you have PostgreSQL running. Open your PostgreSQL terminal (psql) or pgAdmin and run:
```sql
CREATE DATABASE assetflow_db;
```

Update your database connection string in `database.py` if your local username or password differs:
```python
DATABASE_URL = "postgresql+asyncpg://postgres:password@localhost:5432/assetflow_db"
```

### 2. Dependency Setup
Create a virtual environment and install the required Python packages:
```powershell
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn sqlalchemy asyncpg pydantic passlib bcrypt python-jose python-multipart watchfiles
```

### 3. Database Seeding
Run the database seeder to populate default departments, employee accounts, and initial assets:
```powershell
python seed.py
```

### 4. Running Backend Integration Tests
Validate that all database operations, double-allocation blocks, booking overlaps, and audit logic constraints pass:
```powershell
python verify_backend.py
```

---

## 🏃 Running the Application

Launch the Uvicorn web server:
```powershell
python run.py
```

Once running, navigate to the local portal in your browser:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

### Demo Accounts for Testing
Sign in using any of the following pre-seeded roles:

| Name | Role | Email | Password |
|---|---|---|---|
| Alice Admin | **ADMIN** | `alice@assetflow.com` | `Password123` |
| Priya Patel | **MANAGER** | `priya@assetflow.com` | `Password123` |
| Raj Sharma | **STAFF** | `raj@assetflow.com` | `Password123` |
