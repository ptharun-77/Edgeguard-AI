import enum
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    SAFETY_MANAGER = "SAFETY_MANAGER"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[Role] = mapped_column(Enum(Role, name="role"), default=Role.VIEWER)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SafetyEvent(Base):
    """Schema only in Phase 1. Nothing writes to this table until the Risk Engine exists."""
    __tablename__ = "safety_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    severity: Mapped[str] = mapped_column(String(16))  # LOW|MEDIUM|HIGH|CRITICAL
    risk_score: Mapped[int] = mapped_column(Integer)
    zone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(16), nullable=True)   # anonymous, e.g. W001
    vehicle_id: Mapped[str | None] = mapped_column(String(16), nullable=True)  # e.g. F001
    factors: Mapped[dict] = mapped_column(JSON, default=dict)  # explainable contributing factors
    is_demo: Mapped[bool] = mapped_column(default=True)
    status: Mapped[str] = mapped_column(String(16), default="OPEN")  # OPEN|ACKNOWLEDGED|RESOLVED
    acknowledged_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
