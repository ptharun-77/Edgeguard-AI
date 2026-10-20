import io
import tempfile
from pathlib import Path
import cv2
import numpy as np
import pytest

from app.db import SessionLocal
from app.models import SafetyEvent


def _create_dummy_video() -> bytes:
    """Create a minimal 5-frame 64x64 MP4/AVI video in memory."""
    with tempfile.NamedTemporaryFile(suffix=".avi", delete=False) as tmp:
        tmp_path = tmp.name

    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    out = cv2.VideoWriter(tmp_path, fourcc, 10.0, (64, 64))
    for _ in range(5):
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        out.write(frame)
    out.release()

    with open(tmp_path, "rb") as f:
        data = f.read()
    Path(tmp_path).unlink(missing_ok=True)
    return data


def test_upload_invalid_extension(client):
    fake_file = io.BytesIO(b"fake data")
    r = client.post(
        "/api/video/upload",
        files={"file": ("test.txt", fake_file, "text/plain")},
    )
    assert r.status_code == 400
    assert "Unsupported file type" in r.json()["error"]


def test_upload_and_analyze_flow(client):
    video_bytes = _create_dummy_video()
    file_payload = io.BytesIO(video_bytes)

    # 1. Upload
    up_res = client.post(
        "/api/video/upload",
        files={"file": ("sample.avi", file_payload, "video/x-msvideo")},
    )
    assert up_res.status_code == 200
    up_data = up_res.json()
    assert "video_id" in up_data
    video_id = up_data["video_id"]
    assert up_data["filename"] == "sample.avi"

    # 2. Analyse
    an_res = client.post(f"/api/video/analyse/{video_id}")
    assert an_res.status_code == 200
    an_data = an_res.json()
    assert an_data["video_id"] == video_id
    assert an_data["status"] == "complete"
    assert "risk_level" in an_data
    assert "total_frames" in an_data
    assert "annotated_video" in an_data
    assert "disclaimer" in an_data

    # 3. Check annotated video endpoint
    if an_data["annotated_video"]:
        v_res = client.get(f"/api/video/annotated/{video_id}")
        assert v_res.status_code == 200

    # 4. Nonexistent video returns 404
    non_res = client.post("/api/video/analyse/does_not_exist_999")
    assert non_res.status_code == 404
