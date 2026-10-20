# EdgeGuard AI — Phase 1 (Foundation)

> **STATUS: UNTESTED.** This code was written without network access or the ability to install
> dependencies, so **nothing has been executed**: not the backend, the tests, or the frontend build.
> Expect to fix small errors on first run. Prototype only — not a certified safety system.

## What exists
FastAPI backend (config, JSON logging, health check, JWT auth, bcrypt hashing, RBAC for
ADMIN/SAFETY_MANAGER/OPERATOR/VIEWER, error handlers, login throttling), SQLAlchemy schema
(`users`, `safety_events`), React+TS dashboard shell.
Includes **CCTV Accident Risk Analysis** powered by YOLOv8 + OpenCV with video upload, pedestrian–vehicle proximity detection, risk scoring, annotated playback, safety event persistence, and JSON report export.

## Setup
1. Database: `cp .env.example .env`, set `POSTGRES_PASSWORD`, then `docker compose up -d`.
2. Backend:
   ```
   cd backend && python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp ../.env.example .env   # set DATABASE_URL password, JWT_SECRET, BOOTSTRAP_ADMIN_* (12+ char password)
   uvicorn app.main:app --reload --port 8000
   ```
3. Frontend: `cd frontend && npm install && npm run dev` → http://localhost:5173
4. Tests (use SQLite, need no Postgres): `cd backend && pytest -v`

## Known limitations
- Tables created via `create_all`; no Alembic migrations yet.
- Login throttle is in-memory, single-process.
- Token stored in sessionStorage; no refresh tokens. No frontend tests yet.
- `docs/*.md` listed in the spec are not written yet.
