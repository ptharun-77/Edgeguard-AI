from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter(prefix="/api", tags=["system"])
VERSION = "0.1.0-phase1"


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "down"
    body = {"status": "ok" if db_status == "ok" else "degraded", "version": VERSION, "database": db_status}
    return JSONResponse(body, status_code=200 if db_status == "ok" else 503)
