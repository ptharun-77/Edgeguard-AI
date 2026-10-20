import re
from pydantic import BaseModel, field_validator

from .models import Role

_USERNAME = re.compile(r"^[a-zA-Z0-9_.-]{3,64}$")


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role = Role.VIEWER

    @field_validator("username")
    @classmethod
    def _u(cls, v: str) -> str:
        if not _USERNAME.match(v):
            raise ValueError("username must be 3-64 chars: letters, digits, _ . -")
        return v

    @field_validator("password")
    @classmethod
    def _p(cls, v: str) -> str:
        if len(v) < 12 or len(v) > 128:
            raise ValueError("password must be 12-128 characters")
        return v


class UserOut(BaseModel):
    id: int
    username: str
    role: Role
    is_active: bool
    model_config = {"from_attributes": True}


class SafetyEventOut(BaseModel):
    id: int
    created_at: str | None = None
    severity: str
    risk_score: int
    zone: str | None = None
    worker_id: str | None = None
    vehicle_id: str | None = None
    factors: dict
    is_demo: bool
    status: str
    acknowledged_by: int | None = None
    model_config = {"from_attributes": True}


class SafetyEventCreate(BaseModel):
    severity: str = "HIGH"
    risk_score: int = 85
    zone: str = "Aisle 4 - Loading Dock"
    worker_id: str | None = "W-104"
    vehicle_id: str | None = "FL-02"
    factors: dict = {}
    is_demo: bool = True


class SafetyStatsOut(BaseModel):
    active_vehicles: int
    active_workers: int
    open_alerts: int
    critical_alerts: int
    safety_score: int
    system_latency_ms: float

