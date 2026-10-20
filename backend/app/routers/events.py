from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, get_optional_user
from ..models import SafetyEvent, User
from ..schemas import SafetyEventCreate, SafetyEventOut, SafetyStatsOut

router = APIRouter(prefix="/api", tags=["events"])


def _serialize(event: SafetyEvent) -> SafetyEventOut:
    return SafetyEventOut(
        id=event.id,
        created_at=event.created_at.isoformat() if event.created_at else None,
        severity=event.severity,
        risk_score=event.risk_score,
        zone=event.zone,
        worker_id=event.worker_id,
        vehicle_id=event.vehicle_id,
        factors=event.factors or {},
        is_demo=event.is_demo,
        status=event.status,
        acknowledged_by=event.acknowledged_by,
    )


@router.get("/events", response_model=list[SafetyEventOut])
def list_events(limit: int = 50, db: Session = Depends(get_db)):
    events = db.scalars(select(SafetyEvent).order_by(desc(SafetyEvent.created_at)).limit(limit)).all()
    return [_serialize(e) for e in events]


@router.post("/events", response_model=SafetyEventOut, status_code=201)
def create_event(body: SafetyEventCreate, db: Session = Depends(get_db)):
    event = SafetyEvent(
        severity=body.severity,
        risk_score=body.risk_score,
        zone=body.zone,
        worker_id=body.worker_id,
        vehicle_id=body.vehicle_id,
        factors=body.factors,
        is_demo=body.is_demo,
        status="OPEN",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _serialize(event)


@router.post("/events/{event_id}/ack", response_model=SafetyEventOut)
def acknowledge_event(event_id: int, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    event = db.get(SafetyEvent, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    event.status = "ACKNOWLEDGED"
    if user:
        event.acknowledged_by = user.id
    db.commit()
    db.refresh(event)
    return _serialize(event)


@router.post("/events/{event_id}/resolve", response_model=SafetyEventOut)
def resolve_event(event_id: int, db: Session = Depends(get_db), _: User | None = Depends(get_optional_user)):
    event = db.get(SafetyEvent, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    event.status = "RESOLVED"
    db.commit()
    db.refresh(event)
    return _serialize(event)


@router.get("/stats", response_model=SafetyStatsOut)
def get_stats(db: Session = Depends(get_db)):
    events = db.scalars(select(SafetyEvent)).all()
    open_alerts = sum(1 for e in events if e.status == "OPEN")
    crit = sum(1 for e in events if e.status == "OPEN" and e.severity in ("CRITICAL", "HIGH"))
    return SafetyStatsOut(
        active_vehicles=4,
        active_workers=8,
        open_alerts=open_alerts,
        critical_alerts=crit,
        safety_score=max(30, 96 - crit * 8),
        system_latency_ms=16.4,
    )
