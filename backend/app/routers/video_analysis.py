"""
Video Analysis Router — Industrial Safety Video Monitoring using YOLOv8 + OpenCV.

Accepts uploaded video footage (MP4/AVI/MOV) or built-in industrial sample videos,
runs object detection and tracking for persons and vehicles, evaluates pedestrian–vehicle
proximity in image-space, and returns a structured industrial safety analysis report.

Detected risk events are persisted as SafetyEvent records in the database so they
appear in the Alerts dashboard.

IMPORTANT:
- Distances are approximate image-space estimates in pixels (not metric metres).
- Detections identify potential proximity hazards based on rule-based thresholds;
  they do not claim certified accident prediction.
"""

import logging
import os
import shutil
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SafetyEvent

log = logging.getLogger("edgeguard.video")

router = APIRouter(prefix="/api/video", tags=["video-analysis"])

# ---------------------------------------------------------------------------
# Storage directories — kept under backend/uploads and backend/outputs
# ---------------------------------------------------------------------------
_BASE = Path(__file__).resolve().parent.parent.parent          # backend/
UPLOAD_DIR = _BASE / "uploads"
OUTPUT_DIR = _BASE / "outputs"
SAMPLE_DIR = _BASE.parent / "sample_videos"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov"}
MAX_FILE_SIZE_MB = 500

# ---------------------------------------------------------------------------
# YOLO model lazy-loader
# ---------------------------------------------------------------------------
_yolo_model = None


def _get_model():
    """Lazy-load the YOLOv8 model on first use."""
    global _yolo_model
    if _yolo_model is None:
        try:
            from ultralytics import YOLO
            # nano: fast, lightweight CPU/GPU inference
            _yolo_model = YOLO("yolov8n.pt")
            log.info("YOLOv8n model loaded successfully")
        except ImportError:
            raise HTTPException(
                500,
                "ultralytics is not installed. Run: pip install ultralytics opencv-python-headless",
            )
    return _yolo_model


# ---------------------------------------------------------------------------
# COCO class IDs relevant to pedestrian–vehicle safety analysis
# ---------------------------------------------------------------------------
PERSON_CLASS_IDS = {0}                         # person
VEHICLE_CLASS_IDS = {1, 2, 3, 5, 7}           # bicycle, car, motorcycle, bus, truck
ALL_RELEVANT_IDS = PERSON_CLASS_IDS | VEHICLE_CLASS_IDS

COCO_NAMES = {
    0: "person", 1: "bicycle", 2: "car", 3: "motorcycle",
    5: "bus", 7: "truck",
}

DEFAULT_PROXIMITY_THRESHOLD_PX = 150
EVENT_COOLDOWN_FRAMES = 30


def _risk_level(event_count: int) -> tuple[str, int]:
    """Return (severity, risk_score) based on the number of proximity events."""
    if event_count == 0:
        return ("LOW", 10)
    elif event_count <= 2:
        return ("MODERATE", 45)
    elif event_count <= 5:
        return ("HIGH", 72)
    else:
        return ("CRITICAL", 92)


def _fmt_time(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


# ---------------------------------------------------------------------------
# GET /api/video/samples — List built-in sample videos
# ---------------------------------------------------------------------------
@router.get("/samples")
def list_sample_videos():
    """List available sample industrial videos for testing and expo demonstrations."""
    samples = []
    if SAMPLE_DIR.exists():
        for path in sorted(SAMPLE_DIR.glob("*.*")):
            if path.suffix.lower() in ALLOWED_EXTENSIONS:
                samples.append({
                    "filename": path.name,
                    "display_name": path.name.replace("-", " ").replace("_", " ").title(),
                    "size_mb": round(path.stat().st_size / (1024 * 1024), 2),
                    "extension": path.suffix.lower(),
                })
    return {"samples": samples}


# ---------------------------------------------------------------------------
# POST /api/video/load-sample/{sample_name} — Load a sample video for analysis
# ---------------------------------------------------------------------------
@router.post("/load-sample/{sample_name}")
def load_sample_video(sample_name: str):
    """Copy a built-in sample video into the upload directory and return its video_id."""
    clean_name = Path(sample_name).name
    sample_path = SAMPLE_DIR / clean_name
    if not sample_path.exists():
        raise HTTPException(404, f"Sample video '{clean_name}' not found")

    ext = sample_path.suffix.lower()
    video_id = uuid.uuid4().hex[:12]
    safe_name = f"{video_id}{ext}"
    dest = UPLOAD_DIR / safe_name

    shutil.copyfile(str(sample_path), str(dest))
    size_bytes = dest.stat().st_size
    size_mb = round(size_bytes / (1024 * 1024), 2)

    log.info("sample video loaded", extra={"extra_fields": {"video_id": video_id, "sample": clean_name}})

    return {
        "video_id": video_id,
        "filename": clean_name,
        "size_bytes": size_bytes,
        "size_mb": size_mb,
        "stored_as": safe_name,
        "is_sample": True,
    }


# ---------------------------------------------------------------------------
# POST /api/video/upload — Upload a video file
# ---------------------------------------------------------------------------
@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Accept a video upload and persist it to disk."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    video_id = uuid.uuid4().hex[:12]
    safe_name = f"{video_id}{ext}"
    dest = UPLOAD_DIR / safe_name

    total = 0
    with open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_FILE_SIZE_MB * 1024 * 1024:
                dest.unlink(missing_ok=True)
                raise HTTPException(400, f"File exceeds {MAX_FILE_SIZE_MB} MB limit")
            f.write(chunk)

    size_mb = round(total / (1024 * 1024), 2)
    log.info("video uploaded", extra={"extra_fields": {"video_id": video_id, "filename": file.filename, "size_mb": size_mb}})

    return {
        "video_id": video_id,
        "filename": file.filename,
        "size_bytes": total,
        "size_mb": size_mb,
        "stored_as": safe_name,
    }


# ---------------------------------------------------------------------------
# POST /api/video/analyse/{video_id} — Run detection, tracking & risk analysis
# ---------------------------------------------------------------------------
@router.post("/analyse/{video_id}")
def analyse_video(
    video_id: str,
    proximity_px: int = Query(DEFAULT_PROXIMITY_THRESHOLD_PX, ge=50, le=400),
    db: Session = Depends(get_db),
):
    """
    Run YOLOv8 object detection and tracking, detect person–vehicle proximity events,
    and persist results as SafetyEvent records in the database.
    """
    import cv2

    matches = list(UPLOAD_DIR.glob(f"{video_id}.*"))
    if not matches:
        raise HTTPException(404, f"Video '{video_id}' not found")
    src_path = matches[0]

    model = _get_model()

    cap = cv2.VideoCapture(str(src_path))
    if not cap.isOpened():
        raise HTTPException(400, "Could not open video file — possibly corrupt or unsupported format")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Annotated output video
    out_name = f"{video_id}_annotated.mp4"
    out_path = OUTPUT_DIR / out_name
    fourcc = cv2.VideoWriter_fourcc(*"avc1")
    writer = cv2.VideoWriter(str(out_path), fourcc, fps, (w, h))
    if not writer.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(out_path), fourcc, fps, (w, h))

    # --- Analysis state ---
    frame_idx = 0
    processed_frames = 0
    total_persons = 0
    total_vehicles = 0
    risk_events: list[dict[str, Any]] = []
    frame_detections: list[dict[str, Any]] = []
    last_event_frame: dict[str, int] = {}

    # Sample at ~3-4 frames/sec to balance high speed and temporal coverage
    SAMPLE_EVERY = max(2, int(round(fps / 3)))

    t0 = time.perf_counter()

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame_idx += 1

        if frame_idx % SAMPLE_EVERY != 0:
            if writer.isOpened():
                writer.write(frame)
            continue

        processed_frames += 1
        timestamp_sec = round(frame_idx / fps, 2)

        # Run tracking if possible, otherwise object detection
        try:
            results = model.track(frame, persist=True, verbose=False, conf=0.32)
        except Exception:
            results = model(frame, verbose=False, conf=0.32)

        persons: list[dict] = []
        vehicles: list[dict] = []

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                if cls_id not in ALL_RELEVANT_IDS:
                    continue

                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                conf = float(box.conf[0])
                label = COCO_NAMES.get(cls_id, f"class_{cls_id}")

                track_id = int(box.id[0]) if hasattr(box, "id") and box.id is not None else None

                entry = {
                    "class_id": cls_id,
                    "label": label,
                    "track_id": track_id,
                    "confidence": round(conf, 2),
                    "bbox": [x1, y1, x2, y2],
                    "center": (cx, cy),
                }

                if cls_id in PERSON_CLASS_IDS:
                    persons.append(entry)
                    total_persons += 1
                    # Draw person bounding box (safety green)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 80), 2)
                    id_tag = f" ID:{track_id}" if track_id is not None else ""
                    cv2.putText(
                        frame,
                        f"Person{id_tag} {conf:.0%}",
                        (x1, max(14, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.45,
                        (0, 200, 80),
                        1,
                    )
                else:
                    vehicles.append(entry)
                    total_vehicles += 1
                    # Draw vehicle bounding box (amber/orange)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 140, 0), 2)
                    id_tag = f" ID:{track_id}" if track_id is not None else ""
                    cv2.putText(
                        frame,
                        f"{label.capitalize()}{id_tag} {conf:.0%}",
                        (x1, max(14, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.45,
                        (255, 140, 0),
                        1,
                    )

        # --- Proximity Analysis ---
        frame_had_risk = False
        for pi, p in enumerate(persons):
            for vi, v in enumerate(vehicles):
                px, py = p["center"]
                vx, vy = v["center"]
                dist = ((px - vx) ** 2 + (py - vy) ** 2) ** 0.5

                if dist < proximity_px:
                    frame_had_risk = True
                    pair_key = (
                        f"p{p.get('track_id', pi)}-v{v.get('track_id', vi)}"
                    )
                    last = last_event_frame.get(pair_key, -EVENT_COOLDOWN_FRAMES - 1)
                    if frame_idx - last < EVENT_COOLDOWN_FRAMES:
                        continue
                    last_event_frame[pair_key] = frame_idx

                    # Severity based on proximity proportion
                    if dist < proximity_px * 0.45:
                        severity = "CRITICAL"
                        action = "Immediate review: verify pedestrian crosswalk clearance and driver line-of-sight."
                    elif dist < proximity_px * 0.75:
                        severity = "HIGH"
                        action = "Prompt review: evaluate vehicle approach speed and pedestrian pathway separation."
                    else:
                        severity = "MODERATE"
                        action = "Check corridor layout and remind operators of minimum distance buffer."

                    event_desc = (
                        f"Person and {v['label']} detected within {round(dist, 1)}px image-space distance "
                        f"at {_fmt_time(timestamp_sec)} (frame {frame_idx})."
                    )

                    event = {
                        "frame": frame_idx,
                        "timestamp_sec": timestamp_sec,
                        "timestamp_fmt": _fmt_time(timestamp_sec),
                        "person": p["label"],
                        "person_confidence": p["confidence"],
                        "person_track_id": p.get("track_id"),
                        "person_bbox": p["bbox"],
                        "vehicle": v["label"],
                        "vehicle_confidence": v["confidence"],
                        "vehicle_track_id": v.get("track_id"),
                        "vehicle_bbox": v["bbox"],
                        "distance_px": round(dist, 1),
                        "threshold_px": proximity_px,
                        "severity": severity,
                        "what": f"Person - {v['label'].capitalize()} Too Close",
                        "when": f"{_fmt_time(timestamp_sec)} (Frame {frame_idx})",
                        "evidence": f"Person ({p['confidence']:.0%}) and {v['label']} ({v['confidence']:.0%}) approached within {round(dist, 1)}px image-space distance (threshold: {proximity_px}px).",
                        "suggested_action": action,
                        "description": event_desc,
                    }
                    risk_events.append(event)

                    # Draw hazard indicator on frame
                    cv2.line(frame, (px, py), (vx, vy), (0, 0, 255), 2)
                    cv2.circle(frame, (px, py), 4, (0, 0, 255), -1)
                    cv2.circle(frame, (vx, vy), 4, (0, 0, 255), -1)
                    mid_x, mid_y = (px + vx) // 2, (py + vy) // 2
                    cv2.putText(
                        frame,
                        f"PROXIMITY: {round(dist, 0):.0f}px",
                        (mid_x - 30, max(20, mid_y - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.45,
                        (0, 0, 255),
                        1,
                    )

        # Store sampled frame detections for the interactive frontend overlay
        frame_detections.append({
            "frame": frame_idx,
            "timestamp_sec": timestamp_sec,
            "persons": persons,
            "vehicles": vehicles,
            "has_risk": frame_had_risk,
        })

        # Watermark HUD
        cv2.putText(
            frame,
            f"EdgeGuard AI | Frame {frame_idx}/{total_frames} | {datetime.now(timezone.utc).strftime('%H:%M:%SZ')}",
            (12, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (210, 210, 210),
            1,
        )

        if writer.isOpened():
            writer.write(frame)

    cap.release()
    if writer.isOpened():
        writer.release()

    elapsed = round(time.perf_counter() - t0, 2)
    severity, risk_score = _risk_level(len(risk_events))

    # Persist detected events to database
    created_event_ids: list[int] = []
    for evt in risk_events:
        score_val = 90 if evt["severity"] == "CRITICAL" else 75 if evt["severity"] == "HIGH" else 50
        se = SafetyEvent(
            severity=evt["severity"],
            risk_score=score_val,
            zone=f"Video Analysis — {src_path.name}",
            worker_id=f"Track #{evt['person_track_id']}" if evt.get("person_track_id") is not None else "Person",
            vehicle_id=f"Track #{evt['vehicle_track_id']}" if evt.get("vehicle_track_id") is not None else evt["vehicle"].capitalize(),
            factors={
                "source": "video_analysis",
                "video_id": video_id,
                "video_name": src_path.name,
                "frame": evt["frame"],
                "timestamp": evt["timestamp_fmt"],
                "timestamp_sec": evt["timestamp_sec"],
                "what": evt["what"],
                "when": evt["when"],
                "evidence": evt["evidence"],
                "suggested_action": evt["suggested_action"],
                "person": evt["person"],
                "person_confidence": evt["person_confidence"],
                "vehicle": evt["vehicle"],
                "vehicle_confidence": evt["vehicle_confidence"],
                "distance_px": evt["distance_px"],
                "threshold_px": proximity_px,
                "description": evt["description"],
            },
            is_demo=False,
            status="OPEN",
        )
        db.add(se)
        db.flush()
        created_event_ids.append(se.id)

    db.commit()

    log.info(
        "video analysis complete",
        extra={"extra_fields": {
            "video_id": video_id,
            "frames": total_frames,
            "processed": processed_frames,
            "risk_events": len(risk_events),
            "elapsed_sec": elapsed,
        }},
    )

    annotated_url = f"/api/video/annotated/{video_id}" if out_path.exists() and out_path.stat().st_size > 0 else None
    original_url = f"/api/video/original/{video_id}"

    return {
        "video_id": video_id,
        "filename": src_path.name,
        "status": "complete",
        "duration_sec": round(total_frames / fps, 2) if fps else 0,
        "fps": round(fps, 1),
        "resolution": f"{w}x{h}",
        "total_frames": total_frames,
        "processed_frames": processed_frames,
        "total_persons_detected": total_persons,
        "total_vehicles_detected": total_vehicles,
        "risk_events": risk_events,
        "risk_event_count": len(risk_events),
        "risk_level": severity,
        "risk_score": risk_score,
        "processing_time_sec": elapsed,
        "annotated_video": annotated_url,
        "original_video": original_url,
        "frame_detections": frame_detections,
        "proximity_threshold_px": proximity_px,
        "measurement_note": "Distances are approximate image-space estimates in pixels. Physical metric distances require camera calibration.",
        "created_alert_ids": created_event_ids,
        "disclaimer": (
            "These results represent potential safety risks identified by "
            "automated object detection and proximity analysis. They do not constitute "
            "an accident prediction or certified safety assessment. Human review is recommended."
        ),
    }


# ---------------------------------------------------------------------------
# GET /api/video/original/{video_id} — Stream the original uploaded video
# ---------------------------------------------------------------------------
@router.get("/original/{video_id}")
def get_original_video(video_id: str):
    matches = list(UPLOAD_DIR.glob(f"{video_id}.*"))
    if not matches:
        raise HTTPException(404, "Original video not found")
    src_path = matches[0]
    media_type = "video/mp4" if src_path.suffix.lower() == ".mp4" else "video/quicktime" if src_path.suffix.lower() == ".mov" else "video/x-msvideo"
    return FileResponse(str(src_path), media_type=media_type, filename=src_path.name)


# ---------------------------------------------------------------------------
# GET /api/video/annotated/{video_id} — Stream the annotated video
# ---------------------------------------------------------------------------
@router.get("/annotated/{video_id}")
def get_annotated_video(video_id: str):
    out_path = OUTPUT_DIR / f"{video_id}_annotated.mp4"
    if not out_path.exists():
        raise HTTPException(404, "Annotated video not found")
    return FileResponse(str(out_path), media_type="video/mp4", filename=f"{video_id}_annotated.mp4")


# ---------------------------------------------------------------------------
# GET /api/video/report/{video_id} — Download JSON report
# ---------------------------------------------------------------------------
@router.get("/report/{video_id}")
def download_report(video_id: str, db: Session = Depends(get_db)):
    """Return the structured safety report for download."""
    events = [
        e for e in db.query(SafetyEvent).all()
        if isinstance(e.factors, dict) and e.factors.get("video_id") == video_id
    ]

    report = {
        "report_type": "EdgeGuard AI Industrial Video Safety Report",
        "video_id": video_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "standards_notice": "Proximity and trajectory analysis are automated assistive estimates. Camera calibration required for metric distances.",
        "disclaimer": (
            "These results represent potential safety risks identified by "
            "automated computer vision analysis. They do not guarantee accident "
            "occurrence or certified compliance without human verification."
        ),
        "total_events": len(events),
        "events": [
            {
                "id": e.id,
                "severity": e.severity,
                "risk_score": e.risk_score,
                "zone": e.zone,
                "status": e.status,
                "what": e.factors.get("what", "Proximity conflict"),
                "when": e.factors.get("when", e.factors.get("timestamp")),
                "evidence": e.factors.get("evidence", e.factors.get("description")),
                "suggested_action": e.factors.get("suggested_action", "Conduct operator review"),
                "details": e.factors,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }
    return JSONResponse(
        content=report,
        headers={"Content-Disposition": f'attachment; filename="edgeguard_safety_report_{video_id}.json"'},
    )
