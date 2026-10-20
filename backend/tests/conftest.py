import os
import tempfile

_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_dir}/test.db"
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret-123"
os.environ["BOOTSTRAP_ADMIN_USERNAME"] = "admin"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = "admin-password-123"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:  # runs lifespan (creates tables + bootstrap admin)
        yield c


def login(client, username="admin", password="admin-password-123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


@pytest.fixture(scope="session")
def admin_headers(client):
    return {"Authorization": f"Bearer {login(client).json()['access_token']}"}
