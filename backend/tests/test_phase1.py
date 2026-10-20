from app.db import SessionLocal
from app.models import User
from tests.conftest import login


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["database"] == "ok"


def test_login_success_and_me(client, admin_headers):
    r = client.get("/api/auth/me", headers=admin_headers)
    assert r.status_code == 200 and r.json()["role"] == "ADMIN"


def test_login_wrong_password(client):
    assert login(client, password="wrong-password-xx").status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_password_is_hashed(client):
    with SessionLocal() as db:
        u = db.query(User).filter_by(username="admin").one()
        assert u.password_hash != "admin-password-123" and u.password_hash.startswith("$2")


def test_admin_creates_user_then_viewer_forbidden(client, admin_headers):
    r = client.post("/api/users", headers=admin_headers,
                    json={"username": "viewer1", "password": "viewer-password-1", "role": "VIEWER"})
    assert r.status_code == 201
    vt = login(client, "viewer1", "viewer-password-1").json()["access_token"]
    r = client.post("/api/users", headers={"Authorization": f"Bearer {vt}"},
                    json={"username": "x_user", "password": "another-password-1"})
    assert r.status_code == 403


def test_validation_rejects_short_password(client, admin_headers):
    r = client.post("/api/users", headers=admin_headers, json={"username": "bob_ok", "password": "short"})
    assert r.status_code == 422 and r.json()["error"] == "Validation failed"


def test_duplicate_username_conflict(client, admin_headers):
    r = client.post("/api/users", headers=admin_headers,
                    json={"username": "admin", "password": "admin-password-123"})
    assert r.status_code == 409
