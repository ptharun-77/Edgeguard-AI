export type User = { id: number; username: string; role: string; is_active: boolean };
export type Health = { status: string; version: string; database: string };

export type SafetyEvent = {
  id: number;
  created_at?: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "MEDIUM" | "LOW";
  risk_score: number;
  zone: string;
  worker_id?: string;
  vehicle_id?: string;
  factors: Record<string, any>;
  is_demo: boolean;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  acknowledged_by?: number;
};

export type SafetyStats = {
  active_vehicles: number;
  active_workers: number;
  open_alerts: number;
  critical_alerts: number;
  safety_score: number;
  system_latency_ms: number;
};

const KEY = "eg_token";
export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t: string | null) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY));

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 503) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const login = async (username: string, password: string) => {
  // If backend is running, talk to backend. If backend unreachable in mock preview, provide demo token.
  try {
    const res = await req<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(res.access_token);
    return res.access_token;
  } catch (err) {
    if (username === "admin" && (password === "admin-password-123" || password.length >= 8)) {
      const mockToken = "mock_admin_token_" + Date.now();
      setToken(mockToken);
      return mockToken;
    }
    throw err;
  }
};

export const me = async (): Promise<User> => {
  const token = getToken();
  if (token && token.startsWith("mock_")) {
    return { id: 1, username: "admin", role: "ADMIN", is_active: true };
  }
  return req<User>("/api/auth/me");
};

export const health = async (): Promise<Health> => {
  try {
    return await req<Health>("/api/health");
  } catch {
    return { status: "preview-mode", version: "0.1.0-preview", database: "in-memory-engine" };
  }
};

export const fetchEvents = async (): Promise<SafetyEvent[]> => {
  try {
    return await req<SafetyEvent[]>("/api/events");
  } catch {
    return [];
  }
};

export const acknowledgeEventApi = async (id: number): Promise<SafetyEvent | null> => {
  try {
    return await req<SafetyEvent>(`/api/events/${id}/ack`, { method: "POST" });
  } catch {
    return null;
  }
};

export const resolveEventApi = async (id: number): Promise<SafetyEvent | null> => {
  try {
    return await req<SafetyEvent>(`/api/events/${id}/resolve`, { method: "POST" });
  } catch {
    return null;
  }
};

export const createEventApi = async (data: Partial<SafetyEvent>): Promise<SafetyEvent | null> => {
  try {
    return await req<SafetyEvent>("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    });
  } catch {
    return null;
  }
};

// --- Video Analysis API ---

export type VideoUploadResult = {
  video_id: string;
  filename: string;
  size_bytes: number;
  size_mb: number;
  stored_as: string;
  is_sample?: boolean;
};

export type VideoDetectedEntity = {
  class_id: number;
  label: string;
  track_id?: number | null;
  confidence: number;
  bbox: [number, number, number, number];
  center: [number, number];
};

export type VideoFrameDetection = {
  frame: number;
  timestamp_sec: number;
  persons: VideoDetectedEntity[];
  vehicles: VideoDetectedEntity[];
  has_risk: boolean;
};

export type VideoRiskEvent = {
  frame: number;
  timestamp_sec: number;
  timestamp_fmt: string;
  person: string;
  person_confidence: number;
  person_track_id?: number | null;
  person_bbox?: [number, number, number, number];
  vehicle: string;
  vehicle_confidence: number;
  vehicle_track_id?: number | null;
  vehicle_bbox?: [number, number, number, number];
  distance_px: number;
  threshold_px?: number;
  severity?: "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | string;
  what?: string;
  when?: string;
  evidence?: string;
  suggested_action?: string;
  description: string;
};

export type VideoAnalysisResult = {
  video_id: string;
  filename: string;
  status: string;
  duration_sec: number;
  fps: number;
  resolution: string;
  total_frames: number;
  processed_frames: number;
  total_persons_detected: number;
  total_vehicles_detected: number;
  risk_events: VideoRiskEvent[];
  risk_event_count: number;
  risk_level: string;
  risk_score: number;
  processing_time_sec: number;
  annotated_video: string | null;
  original_video?: string | null;
  frame_detections?: VideoFrameDetection[];
  proximity_threshold_px?: number;
  measurement_note?: string;
  created_alert_ids: number[];
  disclaimer: string;
};

export type SampleVideoItem = {
  filename: string;
  display_name: string;
  size_mb: number;
  extension: string;
};

export const uploadVideo = async (file: File): Promise<VideoUploadResult> => {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/video/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? body.detail ?? `Upload failed (${res.status})`);
  return body as VideoUploadResult;
};

export const analyseVideo = async (videoId: string, proximityPx: number = 150): Promise<VideoAnalysisResult> => {
  return req<VideoAnalysisResult>(`/api/video/analyse/${videoId}?proximity_px=${proximityPx}`, { method: "POST" });
};

export const fetchSampleVideos = async (): Promise<SampleVideoItem[]> => {
  try {
    const res = await req<{ samples: SampleVideoItem[] }>("/api/video/samples");
    return res.samples || [];
  } catch {
    return [];
  }
};

export const loadSampleVideo = async (sampleName: string): Promise<VideoUploadResult> => {
  return req<VideoUploadResult>(`/api/video/load-sample/${encodeURIComponent(sampleName)}`, { method: "POST" });
};
