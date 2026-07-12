from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth, assets, bookings, maintenance, audits, dashboard

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create all tables on startup if they don't exist yet
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Dispose of engine connection pool on shutdown
    await engine.dispose()

app = FastAPI(
    title="AssetFlow Enterprise Backend API",
    description="Production-ready FastAPI backend for the Asset & Resource Management System.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend/Stitch compatibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Wire up routers
app.include_router(auth.router)
app.include_router(assets.router)
app.include_router(bookings.router)
app.include_router(maintenance.router)
app.include_router(audits.router)
app.include_router(dashboard.router)

# Mount static files directory
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "status": "online",
        "system": "AssetFlow Enterprise ERP Backend (Frontend index.html not built yet)",
        "documentation": "/docs"
    }

