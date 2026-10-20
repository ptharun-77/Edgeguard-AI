import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_roles
from ..models import Role, User
from ..schemas import LoginIn, TokenOut, UserCreate, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api", tags=["auth"])

# Simple in-memory brute-force guard (single process only; replace with a shared store when scaling).
_FAILS: dict[str, list[float]] = defaultdict(list)
_MAX_FAILS, _WINDOW = 5, 300


def _key(req: Request, username: str) -> str:
    return f"{req.client.host if req.client else '?'}|{username.lower()}"


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    k, now = _key(request, body.username), time.time()
    _FAILS[k] = [t for t in _FAILS[k] if now - t < _WINDOW]
    if len(_FAILS[k]) >= _MAX_FAILS:
        raise HTTPException(429, "Too many failed attempts. Try again later.")
    user = db.scalar(select(User).where(User.username == body.username))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        _FAILS[k].append(now)
        raise HTTPException(401, "Invalid credentials")
    _FAILS.pop(k, None)
    return TokenOut(access_token=create_access_token(user.id, user.role.value))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_roles(Role.ADMIN))):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(409, "Username already exists")
    user = User(username=body.username, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    return user
