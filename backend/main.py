from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import func, select

from backend.api import auth as auth_router
from backend.api import dashboard as dashboard_router
from backend.api import plugins as plugins_router
from backend.api import settings as settings_router
from backend.auth import hash_password
from backend.database import AsyncSessionLocal, init_db, migrate_db
from backend.models import Setting, User
from backend.plugins import registry
from backend.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent.parent / "static"


async def _bootstrap_admin() -> None:
    """Create default admin/admin account on first run."""
    async with AsyncSessionLocal() as db:
        count = await db.scalar(select(func.count()).select_from(User))
        if count == 0:
            user = User(
                username="admin",
                hashed_password=hash_password("admin"),
                is_admin=True,
            )
            db.add(user)
            # Mark that this default account needs a password change
            setting = Setting(key="setup_required", value="true")
            db.add(setting)
            await db.commit()
            logger.info("Created default admin account (admin/admin) — please change the password")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await migrate_db()   # safe schema migrations (idempotent)
    await init_db()
    await _bootstrap_admin()
    registry.discover_plugins()
    async with AsyncSessionLocal() as db:
        await registry.load_enabled_plugins(db, app)
    start_scheduler()
    logger.info("UHLD started")
    yield
    # Shutdown
    stop_scheduler()
    for inst in registry.get_all_instances().values():
        try:
            await inst.on_disable()
        except Exception:
            pass
    logger.info("UHLD stopped")


app = FastAPI(
    title="UHLD — Ultimate Homelab Dashboard",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core API routers
app.include_router(auth_router.router)
app.include_router(plugins_router.router)
app.include_router(dashboard_router.router)
app.include_router(settings_router.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Static assets (JS/CSS bundles)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> FileResponse | JSONResponse:
    """
    Serve the React SPA for any path that doesn't match a real route.
    API paths get a JSON 404 instead so callers get a proper error.
    """
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"detail": "Not found"}, status_code=404)
