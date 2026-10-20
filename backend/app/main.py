import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .config import get_settings
from .db import Base, SessionLocal, engine
from .logging_config import setup_logging
from .models import Role, SafetyEvent, User
from .routers import auth, events, health, video_analysis
from .security import hash_password

settings = get_settings()
setup_logging(settings.log_level)
log = logging.getLogger("edgeguard")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # NOTE: create_all is a Phase 1 shortcut. Add Alembic migrations before production use.
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if settings.bootstrap_admin_username and settings.bootstrap_admin_password:
            if db.scalar(select(User).limit(1)) is None:
                db.add(User(username=settings.bootstrap_admin_username,
                            password_hash=hash_password(settings.bootstrap_admin_password),
                            role=Role.ADMIN))
                db.commit()
                log.info("bootstrap admin created")
        if db.scalar(select(SafetyEvent).limit(1)) is None:
            demo_events = [
                SafetyEvent(
                    severity="CRITICAL",
                    risk_score=94,
                    zone="Intersection B - Blind Corner",
                    worker_id="W-104",
                    vehicle_id="FL-02",
                    factors={"ttc_sec": 0.9, "distance_m": 2.4, "forklift_speed_kmh": 14.8, "line_of_sight": "obstructed"},
                    status="OPEN",
                    is_demo=True,
                ),
                SafetyEvent(
                    severity="HIGH",
                    risk_score=78,
                    zone="Aisle 3 - Pallet Racking",
                    worker_id="W-082",
                    vehicle_id="FL-01",
                    factors={"ttc_sec": 1.8, "distance_m": 4.1, "forklift_speed_kmh": 11.2, "line_of_sight": "partial"},
                    status="OPEN",
                    is_demo=True,
                ),
                SafetyEvent(
                    severity="MEDIUM",
                    risk_score=52,
                    zone="Loading Bay 1 - North Gate",
                    worker_id="W-019",
                    vehicle_id="FL-03",
                    factors={"ttc_sec": 3.4, "distance_m": 6.8, "forklift_speed_kmh": 8.0, "line_of_sight": "clear"},
                    status="ACKNOWLEDGED",
                    is_demo=True,
                ),
            ]
            db.add_all(demo_events)
            db.commit()
            log.info("demo safety events seeded")
    yield


app = FastAPI(title="EdgeGuard AI", version="0.1.0-phase1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["Content-Disposition"])


@app.middleware("http")
async def request_log(request: Request, call_next):
    rid, start = uuid.uuid4().hex[:8], time.perf_counter()
    response = await call_next(request)
    ms = round((time.perf_counter() - start) * 1000, 1)
    log.info("request", extra={"extra_fields": {"rid": rid, "method": request.method,
             "path": request.url.path, "status": response.status_code, "ms": ms}})
    response.headers["X-Request-ID"] = rid
    return response


@app.exception_handler(HTTPException)
async def http_err(_: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_err(_: Request, exc: RequestValidationError):
    msgs = [f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
    return JSONResponse({"error": "Validation failed", "details": msgs}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.error("unhandled error", exc_info=exc)
    return JSONResponse({"error": "Internal server error"}, status_code=500)


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(events.router)
app.include_router(video_analysis.router)
