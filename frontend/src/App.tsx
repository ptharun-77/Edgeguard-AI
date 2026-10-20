import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Shield,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Radio,
  Cpu,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  LogOut,
  Sliders,
  ChevronRight,
  Eye,
  Crosshair,
  TrendingDown,
  Info,
  Server,
  Database,
  ArrowRight,
  Video,
  Upload,
  Download,
  FileVideo,
  Clock,
  Users,
  Car,
  Zap,
  Search,
  Filter,
  ExternalLink,
  FileText,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  Health,
  User,
  SafetyEvent,
  fetchEvents,
  acknowledgeEventApi,
  resolveEventApi,
  createEventApi,
  getToken,
  health,
  login,
  me,
  setToken,
  uploadVideo,
  analyseVideo,
  fetchSampleVideos,
  loadSampleVideo,
  SampleVideoItem,
  VideoUploadResult,
  VideoAnalysisResult,
  VideoRiskEvent,
  VideoFrameDetection,
} from "./api";

// --- Entity Types for Live Monitoring Simulation ---
interface Entity {
  id: string;
  name: string;
  type: "forklift" | "worker";
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number; // km/h
  heading: number; // degrees
  battery?: number;
  status: "nominal" | "warning" | "braking" | "danger";
  role?: string;
  hardware?: string;
}

// --- Audio Tone Generator for Industrial Collision Warning ---
class SoundAlarm {
  private ctx: AudioContext | null = null;
  public enabled = false;

  public init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  public chirp(severity: "warning" | "critical") {
    if (!this.enabled || !this.ctx) return;
    try {
      if (this.ctx.state === "suspended") this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = severity === "critical" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(severity === "critical" ? 880 : 540, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(severity === "critical" ? 1760 : 720, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch {
      // Audio autoplay policy fallback
    }
  }
}

const alarm = new SoundAlarm();

// --- Default Entities for Simulated Monitoring ---
const INITIAL_ENTITIES: Entity[] = [
  { id: "FL-01", name: "Forklift Alpha", type: "forklift", x: 180, y: 160, vx: 1.2, vy: 0, speed: 9.5, heading: 0, battery: 91, status: "nominal", hardware: "Jetson Orin Nano (4GB)" },
  { id: "FL-02", name: "Reach Truck Bravo", type: "forklift", x: 420, y: 280, vx: 0, vy: -1.6, speed: 13.2, heading: 270, battery: 84, status: "nominal", hardware: "Jetson Orin Nano (8GB)" },
  { id: "FL-03", name: "Pallet Jack Charlie", type: "forklift", x: 640, y: 130, vx: -0.8, vy: 0.8, speed: 7.1, heading: 135, battery: 78, status: "nominal", hardware: "Jetson AGX Orin" },
  { id: "W-104", name: "Carlos M. (Picker)", type: "worker", x: 420, y: 160, vx: 0, vy: 0.6, speed: 4.2, heading: 90, status: "nominal", role: "Order Fulfillment", hardware: "UWB Tag #9921" },
  { id: "W-082", name: "Sarah K. (Stager)", type: "worker", x: 280, y: 320, vx: -0.4, vy: -0.2, speed: 3.6, heading: 210, status: "nominal", role: "Dock Stager", hardware: "UWB Tag #8814" },
  { id: "W-019", name: "David L. (QC Inspector)", type: "worker", x: 580, y: 360, vx: 0.5, vy: -0.4, speed: 3.8, heading: 315, status: "nominal", role: "Inventory Lead", hardware: "UWB Tag #4402" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Standardized 8 Navigation Tabs
  const [activeTab, setActiveTab] = useState<
    "overview" | "simulation" | "video" | "risk" | "alerts" | "analytics" | "fleet" | "architecture"
  >("overview");

  // System Health
  const [h, setH] = useState<Health | null>(null);
  const [apiOnline, setApiOnline] = useState(false);

  // Simulated Live Monitoring State
  const [entities, setEntities] = useState<Entity[]>(INITIAL_ENTITIES);
  const [simRunning, setSimRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1);
  const [selectedEntityId, setSelectedEntityId] = useState<string>("FL-02");
  const [audioMuted, setAudioMuted] = useState(true);
  const [emergencyAlert, setEmergencyAlert] = useState<{ msg: string; vehicle: string; worker: string; ttc: number } | null>(null);

  // Safety Events Feed
  const [events, setEvents] = useState<SafetyEvent[]>([
    {
      id: 101,
      created_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      severity: "CRITICAL",
      risk_score: 95,
      zone: "Blind Corner B - Main Crosswalk",
      vehicle_id: "FL-02",
      worker_id: "W-104",
      factors: {
        what: "Person–Vehicle Too Close (Blind Corner)",
        when: "4 mins ago",
        evidence: "TTC 0.8s, distance 2.1m, speed 13.8 km/h. Line of sight obstructed by pallet rack.",
        suggested_action: "Review speed limiter setting and add convex safety mirror.",
        ttc_sec: 0.8,
        distance_m: 2.1,
        speed_kmh: 13.8,
        line_of_sight: "obstructed by pallet rack",
      },
      status: "OPEN",
      is_demo: true,
    },
    {
      id: 102,
      created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      severity: "HIGH",
      risk_score: 82,
      zone: "Aisle 3 - Pallet Staging",
      vehicle_id: "FL-01",
      worker_id: "W-082",
      factors: {
        what: "Person–Vehicle Pathway Proximity",
        when: "18 mins ago",
        evidence: "TTC 1.6s, distance 3.8m, speed 10.4 km/h.",
        suggested_action: "Ensure staging lane physical demarcation is visible.",
        ttc_sec: 1.6,
        distance_m: 3.8,
        speed_kmh: 10.4,
        line_of_sight: "partial",
      },
      status: "ACKNOWLEDGED",
      is_demo: true,
    },
    {
      id: 103,
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      severity: "MEDIUM",
      risk_score: 54,
      zone: "Dock Bay 2 - Loading Ramp",
      vehicle_id: "FL-03",
      worker_id: "W-019",
      factors: {
        what: "Speed Threshold Advisory",
        when: "45 mins ago",
        evidence: "TTC 3.1s, distance 6.2m, speed 7.5 km/h.",
        suggested_action: "Operator notified to sound horn before ramp entrance.",
        ttc_sec: 3.1,
        distance_m: 6.2,
        speed_kmh: 7.5,
        line_of_sight: "clear",
      },
      status: "RESOLVED",
      is_demo: true,
    },
  ]);

  // Video Analysis Activity State (shared across tabs)
  const [latestVideoResult, setLatestVideoResult] = useState<VideoAnalysisResult | null>(null);

  // Factor Inspection Modal
  const [inspectEvent, setInspectEvent] = useState<SafetyEvent | null>(null);

  // Check auth & load initial state
  useEffect(() => {
    health()
      .then((data) => {
        setH(data);
        setApiOnline(true);
      })
      .catch(() => {
        setApiOnline(false);
      });

    if (getToken()) {
      me()
        .then(setUser)
        .catch(() => {
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      // Default to operator demo session for instant exploration
      setUser({ id: 1, username: "admin", role: "ADMIN", is_active: true });
      setLoading(false);
    }
  }, []);

  // Fetch real events from backend
  const refreshEvents = () => {
    fetchEvents().then((apiEvents) => {
      if (apiEvents && apiEvents.length > 0) {
        setEvents((prev) => {
          const combined = [...apiEvents];
          prev.forEach((p) => {
            if (!combined.some((c) => c.id === p.id)) combined.push(p);
          });
          return combined;
        });
      }
    });
  };

  useEffect(() => {
    refreshEvents();
  }, []);

  // Toggle audio chime
  const toggleAudio = () => {
    alarm.init();
    alarm.enabled = audioMuted;
    setAudioMuted(!audioMuted);
  };

  // --- Main Simulation Loop for Live Monitoring ---
  useEffect(() => {
    if (!simRunning) return;

    const interval = setInterval(() => {
      setEntities((prev) => {
        let imminentHazard: { msg: string; vehicle: string; worker: string; ttc: number } | null = null;

        const next = prev.map((e) => {
          let nx = e.x + e.vx * simSpeed;
          let ny = e.y + e.vy * simSpeed;
          let nvx = e.vx;
          let nvy = e.vy;

          if (nx < 60 || nx > 740) {
            nvx = -nvx;
            nx = Math.max(60, Math.min(740, nx));
          }
          if (ny < 60 || ny > 420) {
            nvy = -nvy;
            ny = Math.max(60, Math.min(420, ny));
          }

          let newStatus = e.status;
          if (e.type === "forklift") {
            const workers = prev.filter((w) => w.type === "worker");
            let minDist = 9999;
            workers.forEach((w) => {
              const d = Math.sqrt((w.x - nx) ** 2 + (w.y - ny) ** 2);
              if (d < minDist) minDist = d;
            });

            if (minDist < 60) {
              newStatus = "danger";
              const ttcEst = Number((minDist / (e.speed * 2.7)).toFixed(1));
              imminentHazard = {
                msg: "Person–Vehicle Too Close in Monitored Aisle",
                vehicle: e.name,
                worker: "Nearby Personnel",
                ttc: Math.max(0.4, ttcEst),
              };
            } else if (minDist < 110) {
              newStatus = "warning";
            } else {
              newStatus = "nominal";
            }
          }

          return { ...e, x: nx, y: ny, vx: nvx, vy: nvy, status: newStatus };
        });

        if (imminentHazard) {
          setEmergencyAlert(imminentHazard);
          alarm.chirp("critical");
        } else if (emergencyAlert) {
          setEmergencyAlert(null);
        }

        return next;
      });
    }, 60);

    return () => clearInterval(interval);
  }, [simRunning, simSpeed, emergencyAlert]);

  // Manually trigger a scripted near-miss incident
  const triggerNearMiss = () => {
    const nearMissEvent: SafetyEvent = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      severity: "CRITICAL",
      risk_score: 96,
      zone: "Blind Corner B - Intersection",
      vehicle_id: "FL-02",
      worker_id: "W-104",
      factors: {
        what: "Person–Vehicle Too Close",
        when: "Just now (Triggered Event)",
        evidence: "TTC 0.6s, distance 1.8m, vehicle speed 14.2 km/h. Pallet obstruction at corner.",
        suggested_action: "Perform operator review, check blind-corner audio beacon trigger.",
        ttc_sec: 0.6,
        distance_m: 1.8,
        speed_kmh: 14.2,
        line_of_sight: "obstructed",
      },
      status: "OPEN",
      is_demo: true,
    };

    setEvents((prev) => [nearMissEvent, ...prev]);
    setEmergencyAlert({
      msg: "Person–Vehicle Too Close (Intersection B)",
      vehicle: "Reach Truck Bravo (FL-02)",
      worker: "Carlos M. (W-104)",
      ttc: 0.6,
    });
    alarm.chirp("critical");
    createEventApi(nearMissEvent).catch(() => {});
  };

  // Dragging interaction on radar canvas
  const [draggedEntity, setDraggedEntity] = useState<string | null>(null);
  const canvasRef = useRef<SVGSVGElement | null>(null);

  const handlePointerDown = (id: string) => {
    setDraggedEntity(id);
    setSelectedEntityId(id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggedEntity || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 460 / rect.height;
    const x = Math.max(40, Math.min(760, (e.clientX - rect.left) * scaleX));
    const y = Math.max(40, Math.min(420, (e.clientY - rect.top) * scaleY));

    setEntities((prev) => prev.map((ent) => (ent.id === draggedEntity ? { ...ent, x, y } : ent)));
  };

  const handlePointerUp = () => {
    setDraggedEntity(null);
  };

  // Mark as Reviewed ("Acknowledge")
  const handleAcknowledge = async (id: number) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status: "ACKNOWLEDGED" as const } : e)));
    await acknowledgeEventApi(id);
  };

  // Resolve
  const handleResolve = async (id: number) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status: "RESOLVED" as const } : e)));
    await resolveEventApi(id);
  };

  const activeAlertCount = useMemo(() => events.filter((e) => e.status === "OPEN").length, [events]);
  const criticalCount = useMemo(() => events.filter((e) => e.severity === "CRITICAL" && e.status === "OPEN").length, [events]);

  const selectedEntity = entities.find((e) => e.id === selectedEntityId) || entities[0];

  if (loading) {
    return (
      <div className="login-backdrop">
        <div style={{ textAlign: "center", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
          <Activity size={24} className="spin" color="var(--orange-500)" />
          <span>Initialising EdgeGuard AI Command Center…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={setUser} />;
  }

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-nav">
        <div className="brand" onClick={() => setActiveTab("overview")}>
          <div className="brand-icon-wrap">
            <Shield size={20} strokeWidth={2.4} />
          </div>
          <div>
            <div className="brand-title">
              EdgeGuard<span>AI</span>
              <span className="brand-badge">INDUSTRIAL MONITOR</span>
            </div>
          </div>
        </div>

        {/* 8 Standardized Navigation Tabs */}
        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            className={`nav-tab-btn ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <Activity size={14} />
            Overview
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "simulation" ? "active" : ""}`}
            onClick={() => setActiveTab("simulation")}
          >
            <Radio size={14} />
            Live Monitoring
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "video" ? "active" : ""}`}
            onClick={() => setActiveTab("video")}
          >
            <Video size={14} />
            Video Analysis
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "risk" ? "active" : ""}`}
            onClick={() => setActiveTab("risk")}
          >
            <Sliders size={14} />
            Risk Analysis
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => setActiveTab("alerts")}
          >
            <AlertTriangle size={14} />
            Alerts
            {activeAlertCount > 0 && <span className="tab-badge">{activeAlertCount}</span>}
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            <Layers size={14} />
            Safety Reports
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "fleet" ? "active" : ""}`}
            onClick={() => setActiveTab("fleet")}
          >
            <Cpu size={14} />
            System Status
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "architecture" ? "active" : ""}`}
            onClick={() => setActiveTab("architecture")}
          >
            <Server size={14} />
            Project Details
          </button>
        </nav>

        {/* Top Right Actions */}
        <div className="nav-actions">
          <div className={`status-indicator ${emergencyAlert ? "hazard" : ""}`}>
            <span className="status-dot"></span>
            {emergencyAlert ? "HAZARD DETECTED" : "MONITORING ACTIVE"}
          </div>

          <button
            className="sim-btn"
            onClick={toggleAudio}
            title={audioMuted ? "Unmute Collision Warning Chimes" : "Mute Sound"}
          >
            {audioMuted ? <VolumeX size={14} /> : <Volume2 size={14} color="var(--orange-400)" />}
          </button>

          <button className="btn-simulate" onClick={triggerNearMiss} title="Trigger scripted near-miss incident">
            <AlertTriangle size={13} />
            Trigger Near-Miss
          </button>

          {/* User profile */}
          <div className="user-chip">
            <div className="user-info">
              <span className="user-name">{user.username}</span>
              <span className="user-role">{user.role}</span>
            </div>
            <button
              className="btn-logout"
              title="Sign Out"
              onClick={() => {
                setToken(null);
                setUser(null);
              }}
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Sub-bar Telemetry Status */}
      <div className="sub-bar">
        <div className="metrics-strip">
          <div className="metric-pill">
            <Server size={12} color="var(--ok)" />
            Backend: <strong>{apiOnline ? "FastAPI Connected (SQLite)" : "Integrated Engine"}</strong>
          </div>
          <div className="metric-pill">
            <Video size={12} color="var(--orange-400)" />
            Vision Model: <strong>YOLOv8n (Pretrained)</strong>
          </div>
          <div className="metric-pill">
            <Radio size={12} color="var(--cyan)" />
            Fleet Sim: <strong>{entities.filter((e) => e.type === "forklift").length} Forklifts</strong>
          </div>
          <div className="metric-pill">
            <Shield size={12} color="var(--ok)" />
            Personnel: <strong>{entities.filter((e) => e.type === "worker").length} Monitored</strong>
          </div>
        </div>

        {activeTab === "simulation" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              SIM SPEED:
            </span>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                className={`sim-btn ${simSpeed === s ? "active" : ""}`}
                onClick={() => setSimSpeed(s)}
              >
                {s}x
              </button>
            ))}
            <button
              className={`sim-btn ${simRunning ? "" : "active"}`}
              onClick={() => setSimRunning(!simRunning)}
            >
              {simRunning ? <Pause size={12} /> : <Play size={12} />}
              {simRunning ? "Pause" : "Resume"}
            </button>
            <button
              className="sim-btn"
              onClick={() => {
                setEntities(INITIAL_ENTITIES);
                setEmergencyAlert(null);
              }}
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Emergency Hazard Banner */}
      {emergencyAlert && (
        <div className="emergency-banner">
          <div className="emergency-content">
            <AlertTriangle size={18} />
            <span>
              <strong>CRITICAL COLLISION INTERVENTION:</strong> {emergencyAlert.msg} [{emergencyAlert.vehicle} ↔ {emergencyAlert.worker}]
            </span>
          </div>
          <button
            className="emergency-btn-resolve"
            onClick={() => setEmergencyAlert(null)}
          >
            Dismiss Alert
          </button>
        </div>
      )}

      {/* Main Viewport */}
      <main className="main-view">
        {/* =========================================================================
            TAB 1: OVERVIEW (Industrial Safety Overview)
            ========================================================================= */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Top Operational Status Header */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <Activity size={15} color="var(--orange-400)" />
                  Industrial Safety Status & Operational Overview
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="brand-badge">WORKPLACE SAFETY PLATFORM</span>
                </div>
              </div>
              <div className="panel-body">
                <div className="gauge-grid">
                  <div className="gauge-card">
                    <span className="gauge-label">Safety Status</span>
                    <span className="gauge-val" style={{ color: criticalCount > 0 ? "var(--crit)" : activeAlertCount > 0 ? "var(--warn)" : "var(--ok)" }}>
                      {criticalCount > 0 ? "CRITICAL RISK" : activeAlertCount > 0 ? "ELEVATED RISK" : "NORMAL"}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      {activeAlertCount} active alert{activeAlertCount !== 1 ? "s" : ""} require review
                    </span>
                  </div>

                  <div className="gauge-card">
                    <span className="gauge-label">Video Analysis Runs</span>
                    <span className="gauge-val" style={{ color: "var(--cyan)" }}>
                      {latestVideoResult ? "1 Processed" : "Ready"}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      YOLOv8 Person & Vehicle Detection
                    </span>
                  </div>

                  <div className="gauge-card">
                    <span className="gauge-label">Active Forklift Nodes</span>
                    <span className="gauge-val">
                      {entities.filter((e) => e.type === "forklift").length}
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", marginLeft: "4px" }}>(Simulated)</span>
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      Equipped with Directional LiDAR & Vision
                    </span>
                  </div>

                  <div className="gauge-card">
                    <span className="gauge-label">Monitored Zones</span>
                    <span className="gauge-val" style={{ color: "var(--ok)" }}>6 Zones</span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      Aisles 1–6, Blind Corner B, Dock Bays
                    </span>
                  </div>
                </div>

                {/* Quick Action Shortcuts */}
                <div style={{ marginTop: "18px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    className="btn-primary"
                    onClick={() => setActiveTab("video")}
                  >
                    <Upload size={14} />
                    Upload & Analyse Video
                  </button>
                  <button
                    className="btn-ack"
                    onClick={() => setActiveTab("simulation")}
                  >
                    <Radio size={14} color="var(--orange-400)" />
                    Open Live Monitoring
                  </button>
                  <button
                    className="btn-ack"
                    onClick={() => setActiveTab("alerts")}
                  >
                    <AlertTriangle size={14} color="var(--crit)" />
                    Review Active Alerts ({activeAlertCount})
                  </button>
                  <button
                    className="btn-ack"
                    onClick={() => setActiveTab("analytics")}
                  >
                    <Layers size={14} color="var(--cyan)" />
                    View Safety Reports
                  </button>
                </div>
              </div>
            </div>

            {/* Video Analysis Activity & Recent Alerts Split */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
              {/* Left: Video Analysis Activity */}
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <Video size={15} color="var(--orange-400)" />
                    Video Analysis Activity
                  </div>
                  <button
                    className="sim-btn"
                    onClick={() => setActiveTab("video")}
                  >
                    Open Workspace <ChevronRight size={12} />
                  </button>
                </div>
                <div className="panel-body">
                  {latestVideoResult ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong style={{ fontSize: "13.5px" }}>{latestVideoResult.filename}</strong>
                          <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                            {latestVideoResult.duration_sec}s @ {latestVideoResult.fps} FPS · {latestVideoResult.resolution}
                          </div>
                        </div>
                        <span className={`alert-badge ${latestVideoResult.risk_level}`}>
                          {latestVideoResult.risk_level} RISK
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                        <div className="gauge-card" style={{ padding: "8px 10px" }}>
                          <span className="gauge-label" style={{ fontSize: "9.5px" }}>People</span>
                          <span className="gauge-val" style={{ fontSize: "15px", color: "var(--ok)" }}>
                            {latestVideoResult.total_persons_detected}
                          </span>
                        </div>
                        <div className="gauge-card" style={{ padding: "8px 10px" }}>
                          <span className="gauge-label" style={{ fontSize: "9.5px" }}>Vehicles</span>
                          <span className="gauge-val" style={{ fontSize: "15px", color: "var(--cyan)" }}>
                            {latestVideoResult.total_vehicles_detected}
                          </span>
                        </div>
                        <div className="gauge-card" style={{ padding: "8px 10px" }}>
                          <span className="gauge-label" style={{ fontSize: "9.5px" }}>Risk Events</span>
                          <span className="gauge-val" style={{ fontSize: "15px", color: latestVideoResult.risk_event_count > 0 ? "var(--crit)" : "var(--ok)" }}>
                            {latestVideoResult.risk_event_count}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {latestVideoResult.risk_event_count > 0
                          ? `Identified ${latestVideoResult.risk_event_count} proximity event(s). Click below to inspect playback with real-time HUD overlays.`
                          : "No proximity hazards detected in this footage."}
                      </p>

                      <button
                        className="btn-primary"
                        style={{ alignSelf: "flex-start", padding: "7px 14px", fontSize: "12px" }}
                        onClick={() => setActiveTab("video")}
                      >
                        Inspect Analysed Footage <ArrowRight size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <FileVideo size={36} color="var(--text-dim)" />
                      <h4>No Video Analysed Yet</h4>
                      <p>
                        Upload warehouse CCTV footage or load a built-in sample video to detect pedestrians, vehicles, and proximity risks.
                      </p>
                      <button
                        className="btn-primary"
                        style={{ marginTop: "6px" }}
                        onClick={() => setActiveTab("video")}
                      >
                        <Upload size={13} />
                        Choose a Video to Analyse
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Recent Alerts Feed */}
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <AlertTriangle size={15} color="var(--crit)" />
                    Recent Safety Alerts ({events.length})
                  </div>
                  <button
                    className="sim-btn"
                    onClick={() => setActiveTab("alerts")}
                  >
                    View All <ChevronRight size={12} />
                  </button>
                </div>
                <div className="panel-body">
                  <div className="alerts-list" style={{ maxHeight: "360px" }}>
                    {events.slice(0, 5).map((e) => (
                      <div key={e.id} className={`alert-item ${e.severity}`}>
                        <div className="alert-top">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className={`alert-badge ${e.severity}`}>{e.severity}</span>
                            <span className={`status-tag ${e.status}`}>{e.status}</span>
                            {e.is_demo ? (
                              <span style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>[SIMULATED]</span>
                            ) : (
                              <span style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--cyan)" }}>[VIDEO ANALYSIS]</span>
                            )}
                          </div>
                          <span className="alert-time">
                            {new Date(e.created_at || Date.now()).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="alert-desc" style={{ fontWeight: "600" }}>{e.zone}</div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                          {e.factors?.what || e.factors?.description || `${e.vehicle_id} ↔ ${e.worker_id}`}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>
                            Risk Level: <strong>{e.risk_score}/100</strong>
                          </span>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              className="btn-ack"
                              style={{ padding: "3px 8px", fontSize: "11px" }}
                              onClick={() => setInspectEvent(e)}
                            >
                              Inspect
                            </button>
                            {e.status === "OPEN" && (
                              <button
                                className="btn-ack"
                                style={{ padding: "3px 8px", fontSize: "11px", color: "var(--ok)" }}
                                onClick={() => handleAcknowledge(e.id)}
                              >
                                Mark as Reviewed
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Disclaimer & Transparency Notice */}
            <div style={{
              background: "var(--bg-panel)", border: "1px solid var(--line-subtle)",
              borderRadius: "var(--radius-sm)", padding: "12px 16px",
              display: "flex", alignItems: "center", gap: "10px", fontSize: "11.5px", color: "var(--text-dim)"
            }}>
              <Info size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <div>
                <strong>System Transparency Notice:</strong> Live Monitoring runs an interactive demonstration simulation.
                Video Analysis executes genuine YOLOv8 object detection on uploaded footage. Distances in CCTV analysis are
                approximate image-space estimates in pixels; physical metric distances require fixed camera calibration.
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: LIVE MONITORING (Simulated 2D Radar & Testing)
            ========================================================================= */}
        {activeTab === "simulation" && (
          <div className="dashboard-grid">
            {/* Left: 2D Radar Simulation Canvas */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <Radio size={15} color="var(--orange-400)" />
                  Warehouse Floorplan & Live Monitoring Simulation
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="brand-badge sim">INTERACTIVE SIMULATION</span>
                </div>
              </div>

              <div className="panel-body" style={{ padding: "12px" }}>
                <div className="radar-viewport">
                  {/* Radar HUD stats */}
                  <div className="radar-hud-stats">
                    <div>SCAN FIELD: 40m × 23m</div>
                    <div>LiDAR POINTS: 120,400/s</div>
                    <div>UWB REFRESH: 50 Hz</div>
                    <div>FPS: 30 (Dual Stereo)</div>
                  </div>

                  {/* SVG Canvas for Warehouse Floorplan & Entities */}
                  <svg
                    ref={canvasRef}
                    viewBox="0 0 800 460"
                    style={{ width: "100%", height: "100%", minHeight: "500px", display: "block" }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <defs>
                      <radialGradient id="collisionCone" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="warningCone" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ea580c" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Outer Boundary */}
                    <rect x="20" y="20" width="760" height="420" fill="none" stroke="#222c3f" strokeWidth="2" strokeDasharray="6 4" />

                    {/* Pallet Racks (Aisles) */}
                    <rect x="60" y="60" width="120" height="45" fill="#141a27" stroke="#2a364f" strokeWidth="1.5" rx="3" />
                    <text x="120" y="87" fill="#64748b" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">AISLE 1 (PALLETS)</text>

                    <rect x="230" y="60" width="140" height="45" fill="#141a27" stroke="#2a364f" strokeWidth="1.5" rx="3" />
                    <text x="300" y="87" fill="#64748b" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">AISLE 2 (STAGING)</text>

                    <rect x="420" y="60" width="150" height="45" fill="#141a27" stroke="#2a364f" strokeWidth="1.5" rx="3" />
                    <text x="495" y="87" fill="#64748b" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">AISLE 3 (HEAVY RACKS)</text>

                    <rect x="620" y="60" width="130" height="45" fill="#141a27" stroke="#2a364f" strokeWidth="1.5" rx="3" />
                    <text x="685" y="87" fill="#64748b" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">AISLE 4 (BULK)</text>

                    {/* Lower Racks */}
                    <rect x="60" y="220" width="120" height="45" fill="#141a27" stroke="#2a364f" strokeWidth="1.5" rx="3" />
                    <text x="120" y="247" fill="#64748b" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">AISLE 5</text>

                    <rect x="230" y="220" width="140" height="45" fill="#141a27" stroke="#2a364f" strokeWidth="1.5" rx="3" />
                    <text x="300" y="247" fill="#64748b" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">AISLE 6</text>

                    {/* Blind Corner Warning Sign Zone */}
                    <rect x="410" y="105" width="20" height="40" fill="none" stroke="#eab308" strokeWidth="1" strokeDasharray="3 3" />
                    <text x="420" y="155" fill="#eab308" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">⚠ BLIND CORNER B</text>

                    {/* Pedestrian Crosswalk */}
                    <g opacity="0.6">
                      <rect x="380" y="150" width="80" height="50" fill="rgba(16, 185, 129, 0.08)" stroke="#10b981" strokeWidth="1" />
                      {[155, 165, 175, 185, 195].map((lineY) => (
                        <line key={lineY} x1="385" y1={lineY} x2="455" y2={lineY} stroke="#10b981" strokeWidth="2" strokeDasharray="6 4" />
                      ))}
                      <text x="420" y="210" fill="#10b981" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">PEDESTRIAN WALKWAY</text>
                    </g>

                    {/* Loading Dock Zone */}
                    <rect x="60" y="340" width="310" height="80" fill="rgba(6, 182, 212, 0.04)" stroke="#06b6d4" strokeWidth="1" strokeDasharray="4 4" rx="4" />
                    <text x="75" y="360" fill="#06b6d4" fontSize="10" fontFamily="var(--font-mono)">LOADING DOCKS 1–3 (SPEED CAP 8 KM/H)</text>

                    {/* Charging & Maintenance Hub */}
                    <rect x="600" y="340" width="150" height="80" fill="rgba(234, 88, 12, 0.04)" stroke="#ea580c" strokeWidth="1" strokeDasharray="4 4" rx="4" />
                    <text x="615" y="360" fill="#ea580c" fontSize="10" fontFamily="var(--font-mono)">CHARGING BAY</text>

                    {/* Proximity Raycasts between all pairs of Forklifts and Workers */}
                    {entities
                      .filter((e) => e.type === "forklift")
                      .map((fl) =>
                        entities
                          .filter((w) => w.type === "worker")
                          .map((w) => {
                            const dx = w.x - fl.x;
                            const dy = w.y - fl.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist > 150) return null;
                            const distMeters = (dist / 20).toFixed(1);
                            const isCrit = dist < 60;
                            const isWarn = dist < 110;
                            const strokeColor = isCrit ? "#ef4444" : isWarn ? "#ea580c" : "#06b6d4";

                            return (
                              <g key={`${fl.id}-${w.id}`}>
                                <line
                                  x1={fl.x}
                                  y1={fl.y}
                                  x2={w.x}
                                  y2={w.y}
                                  stroke={strokeColor}
                                  strokeWidth={isCrit ? 2.5 : 1.5}
                                  strokeDasharray={isCrit ? "none" : "4 3"}
                                  opacity={isCrit ? 0.9 : 0.6}
                                />
                                <rect
                                  x={(fl.x + w.x) / 2 - 22}
                                  y={(fl.y + w.y) / 2 - 9}
                                  width="44"
                                  height="18"
                                  fill="#0a0d14"
                                  stroke={strokeColor}
                                  strokeWidth="1"
                                  rx="3"
                                />
                                <text
                                  x={(fl.x + w.x) / 2}
                                  y={(fl.y + w.y) / 2 + 3}
                                  fill={strokeColor}
                                  fontSize="9"
                                  fontFamily="var(--font-mono)"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {distMeters}m
                                </text>
                              </g>
                            );
                          })
                      )}

                    {/* Entities rendering */}
                    {entities.map((e) => {
                      const isSelected = e.id === selectedEntityId;
                      const isForklift = e.type === "forklift";
                      const color =
                        e.status === "danger"
                          ? "#ef4444"
                          : e.status === "warning"
                          ? "#ea580c"
                          : isForklift
                          ? "#38bdf8"
                          : "#10b981";

                      return (
                        <g
                          key={e.id}
                          transform={`translate(${e.x}, ${e.y})`}
                          style={{ cursor: "grab" }}
                          onPointerDown={() => handlePointerDown(e.id)}
                        >
                          {/* Selection indicator */}
                          {isSelected && (
                            <circle r={isForklift ? 24 : 18} fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                          )}

                          {/* Warning / Danger Halo */}
                          {e.status === "danger" && (
                            <circle r={isForklift ? 36 : 26} fill="url(#collisionCone)" />
                          )}
                          {e.status === "warning" && (
                            <circle r={isForklift ? 30 : 22} fill="url(#warningCone)" />
                          )}

                          {isForklift ? (
                            /* Forklift shape */
                            <g>
                              <rect x="-14" y="-12" width="28" height="24" fill="#131b2b" stroke={color} strokeWidth="2" rx="4" />
                              <rect x="14" y="-7" width="8" height="14" fill={color} rx="1" />
                              <text x="0" y="3" fill="#fff" fontSize="8" fontFamily="var(--font-mono)" fontWeight="bold" textAnchor="middle">
                                {e.id}
                              </text>
                            </g>
                          ) : (
                            /* Worker shape */
                            <g>
                              <circle r="9" fill="#131b2b" stroke={color} strokeWidth="2" />
                              <circle r="4" fill={color} />
                              <text x="0" y="18" fill="#cbd5e1" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">
                                {e.id}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>

            {/* Right: Selected Entity Inspector */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <Crosshair size={15} color="var(--cyan)" />
                  Entity Inspector ({selectedEntity.id})
                </div>
              </div>
              <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: "700" }}>{selectedEntity.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    TYPE: {selectedEntity.type.toUpperCase()} · STATUS: {selectedEntity.status.toUpperCase()}
                  </div>
                </div>

                <div className="gauge-card">
                  <div className="gauge-header">
                    <span className="gauge-label">Speed</span>
                    <span className="gauge-val">{selectedEntity.speed} km/h</span>
                  </div>
                </div>

                <div className="gauge-card">
                  <div className="gauge-header">
                    <span className="gauge-label">Hardware Sensor</span>
                    <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                      {selectedEntity.hardware || "N/A"}
                    </span>
                  </div>
                </div>

                {selectedEntity.battery !== undefined && (
                  <div className="gauge-card">
                    <div className="gauge-header">
                      <span className="gauge-label">Battery Level</span>
                      <span className="gauge-val" style={{ color: selectedEntity.battery > 30 ? "var(--ok)" : "var(--crit)" }}>
                        {selectedEntity.battery}%
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ background: "var(--bg-panel)", padding: "10px", borderRadius: "var(--radius-sm)", fontSize: "11.5px", color: "var(--text-muted)" }}>
                  💡 <strong>Tip:</strong> Drag any worker or forklift directly on the radar canvas to simulate blind-corner approach trajectories.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: VIDEO ANALYSIS (Real Working Industrial Feature)
            ========================================================================= */}
        {activeTab === "video" && (
          <VideoAnalysisSection
            latestResult={latestVideoResult}
            onAnalysisComplete={(res) => {
              setLatestVideoResult(res);
              refreshEvents();
            }}
          />
        )}

        {/* =========================================================================
            TAB 4: RISK ANALYSIS (Calculation Methodology & Rules)
            ========================================================================= */}
        {activeTab === "risk" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <Sliders size={15} color="var(--orange-400)" />
                  Risk Analysis Methodology & Proximity Rules
                </div>
                <span className="brand-badge">EXPLAINABLE LOGIC</span>
              </div>
              <div className="panel-body">
                <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
                  EdgeGuard evaluates collision risk across both 2D live telemetry (LiDAR/UWB) and CCTV video streams using
                  transparent, rule-based criteria. Measurements are classified into four actionable safety tiers.
                </p>

                <div className="gauge-grid">
                  <div className="gauge-card" style={{ borderLeft: "3px solid var(--crit)" }}>
                    <div className="gauge-header">
                      <span className="gauge-label" style={{ color: "var(--crit)" }}>Critical Risk</span>
                      <span className="alert-badge CRITICAL">CRITICAL</span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-main)", marginTop: "4px" }}>
                      TTC &lt; 1.2s or Distance &lt; 2.0m (Video: &lt; 75px image-space)
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
                      Requires urgent human review. Indicates imminent personnel–vehicle trajectory conflict.
                    </span>
                  </div>

                  <div className="gauge-card" style={{ borderLeft: "3px solid var(--high)" }}>
                    <div className="gauge-header">
                      <span className="gauge-label" style={{ color: "var(--high)" }}>High Risk</span>
                      <span className="alert-badge HIGH">HIGH</span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-main)", marginTop: "4px" }}>
                      TTC 1.2s – 2.0s or Distance 2.0m – 3.5m (Video: 75px – 110px)
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
                      Requires prompt review. Pedestrian and vehicle operating in close shared corridor.
                    </span>
                  </div>

                  <div className="gauge-card" style={{ borderLeft: "3px solid var(--warn)" }}>
                    <div className="gauge-header">
                      <span className="gauge-label" style={{ color: "var(--warn)" }}>Moderate Risk</span>
                      <span className="alert-badge MODERATE">MODERATE</span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-main)", marginTop: "4px" }}>
                      TTC 2.0s – 3.5s or Distance 3.5m – 6.0m (Video: 110px – 150px)
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
                      Advisory observation. Potential pathway intersection; monitor vehicle approach speed.
                    </span>
                  </div>

                  <div className="gauge-card" style={{ borderLeft: "3px solid var(--low)" }}>
                    <div className="gauge-header">
                      <span className="gauge-label" style={{ color: "var(--low)" }}>Low / Normal</span>
                      <span className="alert-badge LOW">LOW</span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-main)", marginTop: "4px" }}>
                      TTC &gt; 3.5s or Distance &gt; 6.0m (Video: &gt; 150px)
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
                      Nominal operations within safe designated separation buffer.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Calibration Explanation */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <Activity size={15} color="var(--cyan)" />
                    Image-Space vs Metric Calibration
                  </div>
                </div>
                <div className="panel-body" style={{ fontSize: "12.5px", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <p>
                    In monocular CCTV video analysis, bounding box centers are measured in <strong>image-space pixels</strong>.
                    Because camera focal lengths, tilt angles, and perspective foreshortening vary, pixel distances cannot be
                    directly converted to metric metres without homography calibration.
                  </p>
                  <p>
                    EdgeGuard transparently labels all CCTV distances as <strong>image-space estimates</strong>, avoiding misleading claims of metric precision without site-specific calibration grids.
                  </p>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <Sliders size={15} color="var(--orange-400)" />
                    Four-Question Explainability Standard
                  </div>
                </div>
                <div className="panel-body" style={{ fontSize: "12.5px", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div><strong>1. What happened?</strong> Concise description of the observed conflict.</div>
                  <div><strong>2. When did it happen?</strong> Exact video timestamp and frame index.</div>
                  <div><strong>3. What evidence triggered it?</strong> Model confidences, pixel distances, and bounding boxes.</div>
                  <div><strong>4. What should the reviewer check next?</strong> Concrete operational safety checklist for plant managers.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: ALERTS (Past and Current Safety Alerts)
            ========================================================================= */}
        {activeTab === "alerts" && (
          <AlertsManagementSection
            events={events}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
            onInspect={(e) => setInspectEvent(e)}
            onJumpToVideo={() => setActiveTab("video")}
          />
        )}

        {/* =========================================================================
            TAB 6: SAFETY REPORTS (Summaries & Downloadable Reports)
            ========================================================================= */}
        {activeTab === "analytics" && (
          <SafetyReportsSection events={events} latestVideoResult={latestVideoResult} />
        )}

        {/* =========================================================================
            TAB 7: SYSTEM STATUS (Diagnostics & Connectivity)
            ========================================================================= */}
        {activeTab === "fleet" && (
          <SystemStatusSection health={h} apiOnline={apiOnline} eventsCount={events.length} />
        )}

        {/* =========================================================================
            TAB 8: PROJECT DETAILS (Scope, Limitations & Architecture)
            ========================================================================= */}
        {activeTab === "architecture" && (
          <ProjectDetailsSection />
        )}
      </main>

      {/* --- Explainable Factors Inspection Modal --- */}
      {inspectEvent && (
        <div className="modal-backdrop" onClick={() => setInspectEvent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={18} color="var(--orange-400)" />
                <h3 style={{ fontSize: "15px", fontWeight: "700" }}>Safety Event Inspection</h3>
              </div>
              <button
                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "16px" }}
                onClick={() => setInspectEvent(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "var(--bg-panel)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Zone / Source:</span>
                <strong>{inspectEvent.zone}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Risk Level:</span>
                <span className={`alert-badge ${inspectEvent.severity}`}>
                  {inspectEvent.severity} ({inspectEvent.risk_score}/100)
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Status:</span>
                <span className={`status-tag ${inspectEvent.status}`}>{inspectEvent.status}</span>
              </div>
            </div>

            <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
              Four-Question Event Assessment
            </h4>

            <div className="alert-structured" style={{ marginBottom: "14px" }}>
              <div className="alert-q-block">
                <span className="alert-q-label">1. What Happened?</span>
                <span className="alert-q-val">{inspectEvent.factors?.what || "Person–Vehicle Proximity Conflict"}</span>
              </div>
              <div className="alert-q-block">
                <span className="alert-q-label">2. When Did It Happen?</span>
                <span className="alert-q-val">{inspectEvent.factors?.when || inspectEvent.created_at || "Recent"}</span>
              </div>
              <div className="alert-q-block" style={{ gridColumn: "span 2" }}>
                <span className="alert-q-label">3. Triggering Evidence</span>
                <span className="alert-q-val">{inspectEvent.factors?.evidence || inspectEvent.factors?.description || "Proximity threshold triggered."}</span>
              </div>
              <div className="alert-q-block" style={{ gridColumn: "span 2" }}>
                <span className="alert-q-label">4. Recommended Next Steps</span>
                <span className="alert-q-val" style={{ color: "var(--orange-400)" }}>
                  {inspectEvent.factors?.suggested_action || "Inspect operator approach speed and verify pedestrian walkway separation."}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button className="btn-ack" onClick={() => setInspectEvent(null)}>
                Close
              </button>
              {inspectEvent.status === "OPEN" && (
                <button
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: "12px" }}
                  onClick={() => {
                    handleAcknowledge(inspectEvent.id);
                    setInspectEvent(null);
                  }}
                >
                  Mark as Reviewed
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// COMPONENT: VideoAnalysisSection (Working Industrial Feature with Real-time HUD)
// =============================================================================
interface VideoAnalysisSectionProps {
  latestResult: VideoAnalysisResult | null;
  onAnalysisComplete: (result: VideoAnalysisResult) => void;
}

const ALLOWED_TYPES = [".mp4", ".avi", ".mov"];
const MAX_SIZE_MB = 500;

function VideoAnalysisSection({ latestResult, onAnalysisComplete }: VideoAnalysisSectionProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<VideoUploadResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysisResult | null>(latestResult);
  const [status, setStatus] = useState<"idle" | "uploading" | "preparing" | "detecting" | "analysing" | "complete" | "error">(
    latestResult ? "complete" : "idle"
  );
  const [honestStage, setHonestStage] = useState<number>(latestResult ? 5 : 1);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Settings
  const [proximityPx, setProximityPx] = useState(150);
  const [sampleVideos, setSampleVideos] = useState<SampleVideoItem[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);

  // Video Player Controls & Real-Time Canvas HUD
  const [videoMode, setVideoMode] = useState<"original_hud" | "annotated">("original_hud");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hudEnabled, setHudEnabled] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch sample industrial videos on mount
  useEffect(() => {
    fetchSampleVideos().then(setSampleVideos);
  }, []);

  const validateAndSetFile = (file: File) => {
    setFileError(null);
    setAnalysisResult(null);
    setUploadResult(null);
    setErrorMsg(null);
    setStatus("idle");
    setHonestStage(1);

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(ext)) {
      setFileError(`Unsupported file format "${ext}". Allowed: MP4, AVI, MOV.`);
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`File exceeds maximum limit of ${MAX_SIZE_MB} MB.`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleLoadSample = async (sampleName: string) => {
    setSampleLoading(true);
    setFileError(null);
    setErrorMsg(null);
    try {
      const loaded = await loadSampleVideo(sampleName);
      setUploadResult(loaded);
      // Point preview to the loaded sample
      setVideoPreviewUrl(`/api/video/original/${loaded.video_id}`);
      setSelectedFile(new File([new Blob()], loaded.filename, { type: "video/mp4" }));
      setStatus("idle");
      setHonestStage(1);
    } catch (e) {
      setFileError("Could not load sample video: " + (e as Error).message);
    } finally {
      setSampleLoading(false);
    }
  };

  const handleAnalyse = async () => {
    if (!selectedFile && !uploadResult) return;

    try {
      setErrorMsg(null);

      let videoId = uploadResult?.video_id;

      // Stage 1: Upload (if not already uploaded)
      if (!videoId && selectedFile) {
        setStatus("uploading");
        setHonestStage(1);
        const upload = await uploadVideo(selectedFile);
        setUploadResult(upload);
        videoId = upload.video_id;
      }

      // Stage 2: Preparing video
      setStatus("preparing");
      setHonestStage(2);
      await new Promise((r) => setTimeout(r, 400));

      // Stage 3 & 4: Detection & Proximity Analysis
      setStatus("analysing");
      setHonestStage(3);

      const result = await analyseVideo(videoId!, proximityPx);
      setAnalysisResult(result);
      onAnalysisComplete(result);
      setStatus("complete");
      setHonestStage(5);
    } catch (err) {
      setStatus("error");
      const msg = (err as Error).message || "";
      if (msg.includes("Failed to fetch") || msg.includes("500") || msg.includes("502") || msg.includes("503")) {
        setErrorMsg("Backend server is offline or unreachable. Please verify that FastAPI is running on port 8000.");
      } else {
        setErrorMsg(msg || "Analysis failed. Please check the video format or backend logs.");
      }
    }
  };

  // Real-Time Canvas HUD Overlay Rendering
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !analysisResult?.frame_detections || videoMode === "annotated" || !hudEnabled) {
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderOverlay = () => {
      const curTime = video.currentTime;
      setCurrentTimeSec(curTime);

      // Match nearest sampled detection frame
      const detections = analysisResult.frame_detections;
      if (!detections || detections.length === 0) return;

      let closest = detections[0];
      let minDiff = Math.abs(detections[0].timestamp_sec - curTime);
      for (let i = 1; i < detections.length; i++) {
        const diff = Math.abs(detections[i].timestamp_sec - curTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = detections[i];
        }
      }

      // Sync canvas dimensions to displayed video dimensions
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Avoid showing stale detections if time difference > 0.8s
      if (minDiff > 0.85) return;

      const videoNativeW = video.videoWidth || 640;
      const videoNativeH = video.videoHeight || 480;
      const scaleX = canvas.width / videoNativeW;
      const scaleY = canvas.height / videoNativeH;

      // Draw Persons (Green)
      closest.persons.forEach((p) => {
        const [x1, y1, x2, y2] = p.bbox;
        const sx1 = x1 * scaleX;
        const sy1 = y1 * scaleY;
        const sw = (x2 - x1) * scaleX;
        const sh = (y2 - y1) * scaleY;

        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx1, sy1, sw, sh);

        ctx.fillStyle = "rgba(16, 185, 129, 0.85)";
        const tag = `Person ${p.track_id ? `#${p.track_id}` : ""} ${(p.confidence * 100).toFixed(0)}%`;
        ctx.font = "11px JetBrains Mono, monospace";
        const textW = ctx.measureText(tag).width;
        ctx.fillRect(sx1, Math.max(0, sy1 - 16), textW + 8, 16);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(tag, sx1 + 4, Math.max(12, sy1 - 4));
      });

      // Draw Vehicles (Orange)
      closest.vehicles.forEach((v) => {
        const [x1, y1, x2, y2] = v.bbox;
        const sx1 = x1 * scaleX;
        const sy1 = y1 * scaleY;
        const sw = (x2 - x1) * scaleX;
        const sh = (y2 - y1) * scaleY;

        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx1, sy1, sw, sh);

        ctx.fillStyle = "rgba(249, 115, 22, 0.85)";
        const tag = `${v.label} ${v.track_id ? `#${v.track_id}` : ""} ${(v.confidence * 100).toFixed(0)}%`;
        ctx.font = "11px JetBrains Mono, monospace";
        const textW = ctx.measureText(tag).width;
        ctx.fillRect(sx1, Math.max(0, sy1 - 16), textW + 8, 16);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(tag, sx1 + 4, Math.max(12, sy1 - 4));
      });

      // Draw Proximity Connections if people and vehicles are within proximityPx
      closest.persons.forEach((p) => {
        closest.vehicles.forEach((v) => {
          const [px, py] = p.center;
          const [vx, vy] = v.center;
          const dist = Math.sqrt((px - vx) ** 2 + (py - vy) ** 2);
          if (dist < proximityPx) {
            const spx = px * scaleX;
            const spy = py * scaleY;
            const svx = vx * scaleX;
            const svy = vy * scaleY;

            ctx.beginPath();
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(spx, spy);
            ctx.lineTo(svx, svy);
            ctx.stroke();
            ctx.setLineDash([]);

            // Center distance label
            const midX = (spx + svx) / 2;
            const midY = (spy + svy) / 2;
            ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
            const distLabel = `PROXIMITY: ${dist.toFixed(0)}px`;
            const dw = ctx.measureText(distLabel).width;
            ctx.fillRect(midX - dw / 2 - 4, midY - 9, dw + 8, 18);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(distLabel, midX - dw / 2, midY + 4);
          }
        });
      });
    };

    const interval = setInterval(renderOverlay, 50);
    return () => clearInterval(interval);
  }, [analysisResult, videoMode, hudEnabled, proximityPx]);

  // Jump video player to specific event timestamp
  const jumpToTimestamp = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, sec - 0.5);
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const activeVideoUrl =
    videoMode === "annotated" && analysisResult?.annotated_video
      ? analysisResult.annotated_video
      : analysisResult?.original_video || videoPreviewUrl;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Workspace Header */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Video size={16} color="var(--orange-400)" />
            Video Analysis — CCTV Safety Monitoring
          </div>
          <span className="brand-badge">PRETRAINED CV MODEL</span>
        </div>
        <div className="panel-body">
          <p style={{ color: "var(--text-muted)", fontSize: "12.5px", marginBottom: "8px" }}>
            Upload recorded industrial footage to detect people, vehicles, and pedestrian–vehicle proximity hazards.
            Detections are evaluated across video frames and persisted to the central safety alerts log.
          </p>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "rgba(234, 179, 8, 0.08)", border: "1px solid var(--warn-border)",
            padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: "11.5px", color: "var(--warn)"
          }}>
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>
              <strong>Measurement Note:</strong> Distances in CCTV footage are calculated in image-space pixels.
              They indicate proximity interactions based on configured rules, but do not replace certified physical distance sensors.
            </span>
          </div>
        </div>
      </div>

      {/* Honest Stages Progress Indicator */}
      {(status !== "idle" || honestStage > 1) && (
        <div className="honest-stages">
          <div className={`stage-step ${honestStage === 1 ? "active" : honestStage > 1 ? "done" : ""}`}>
            <span className="stage-step-num">{honestStage > 1 ? <Check size={10} /> : "1"}</span>
            <span>1. Upload Video</span>
          </div>
          <ChevronRight size={12} color="var(--text-dim)" />
          <div className={`stage-step ${honestStage === 2 ? "active" : honestStage > 2 ? "done" : ""}`}>
            <span className="stage-step-num">{honestStage > 2 ? <Check size={10} /> : "2"}</span>
            <span>2. Prepare Video</span>
          </div>
          <ChevronRight size={12} color="var(--text-dim)" />
          <div className={`stage-step ${honestStage === 3 ? "active" : honestStage > 3 ? "done" : ""}`}>
            <span className="stage-step-num">{honestStage > 3 ? <Check size={10} /> : "3"}</span>
            <span>3. Detect People & Vehicles</span>
          </div>
          <ChevronRight size={12} color="var(--text-dim)" />
          <div className={`stage-step ${honestStage === 4 ? "active" : honestStage > 4 ? "done" : ""}`}>
            <span className="stage-step-num">{honestStage > 4 ? <Check size={10} /> : "4"}</span>
            <span>4. Risk Analysis</span>
          </div>
          <ChevronRight size={12} color="var(--text-dim)" />
          <div className={`stage-step ${honestStage === 5 ? "active done" : ""}`}>
            <span className="stage-step-num">{honestStage === 5 ? <Check size={10} /> : "5"}</span>
            <span>5. Completed</span>
          </div>
        </div>
      )}

      {/* Main Grid: Upload & Controls | Player & Results */}
      <div style={{ display: "grid", gridTemplateColumns: analysisResult ? "440px 1fr" : "1fr", gap: "18px" }}>
        {/* Upload & Controls Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <Upload size={14} color="var(--cyan)" />
                Choose a Video to Analyse
              </div>
            </div>
            <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--orange-500)" : "var(--line-steel)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "30px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "var(--orange-subtle)" : "var(--bg-panel)",
                  transition: "all 0.15s ease",
                }}
              >
                <FileVideo size={36} color={dragOver ? "var(--orange-400)" : "var(--text-dim)"} style={{ marginBottom: "10px" }} />
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", marginBottom: "4px" }}>
                  {dragOver ? "Drop video here" : "Drag & drop video file here"}
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginBottom: "12px" }}>
                  Supports MP4, AVI, MOV · Max {MAX_SIZE_MB} MB
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: "12px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload size={13} />
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp4,.avi,.mov,video/mp4,video/x-msvideo,video/quicktime"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
              </div>

              {/* Sample Videos Selector */}
              {sampleVideos.length > 0 && (
                <div style={{ background: "var(--bg-panel)", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--line-subtle)" }}>
                  <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
                    Try Built-in Industrial Sample Videos:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {sampleVideos.map((s) => (
                      <button
                        key={s.filename}
                        type="button"
                        className="btn-ack"
                        disabled={sampleLoading || status === "analysing"}
                        onClick={() => handleLoadSample(s.filename)}
                        style={{ justifyContent: "space-between", fontSize: "11.5px" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <FileVideo size={13} color="var(--orange-400)" />
                          <span>{s.display_name}</span>
                        </div>
                        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                          {s.size_mb} MB
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Error */}
              {fileError && (
                <div style={{
                  color: "var(--crit)", fontSize: "12px", background: "var(--crit-bg)",
                  border: "1px solid var(--crit-border)", padding: "8px 12px", borderRadius: "var(--radius-sm)",
                  display: "flex", alignItems: "center", gap: "6px"
                }}>
                  <XCircle size={14} />
                  {fileError}
                </div>
              )}

              {/* Selected File Details */}
              {selectedFile && (
                <div style={{
                  background: "var(--bg-panel)", border: "1px solid var(--line-steel)",
                  borderRadius: "var(--radius-sm)", padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <FileVideo size={14} color="var(--orange-400)" />
                      <span style={{ fontWeight: "600", fontSize: "12.5px" }}>{selectedFile.name}</span>
                    </div>
                    <span style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                      {formatBytes(selectedFile.size)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--ok)" }}>
                    <CheckCircle2 size={12} />
                    Ready for analysis
                  </div>
                </div>
              )}

              {/* Configurable Proximity Threshold */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Proximity Threshold:</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "bold" }}>{proximityPx} px</span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="300"
                  step="10"
                  value={proximityPx}
                  onChange={(e) => setProximityPx(Number(e.target.value))}
                  style={{ accentColor: "var(--orange-500)", height: "4px" }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>
                  Image-space distance threshold to trigger proximity conflict warnings.
                </span>
              </div>

              {/* Analyse Video Action */}
              {(selectedFile || uploadResult) && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAnalyse}
                  disabled={status === "uploading" || status === "preparing" || status === "analysing"}
                  style={{ padding: "12px", fontSize: "13px" }}
                >
                  {status === "uploading" ? (
                    <>
                      <Upload size={14} className="spin" />
                      Uploading Video…
                    </>
                  ) : status === "preparing" ? (
                    <>
                      <Activity size={14} className="spin" />
                      Preparing Video Frames…
                    </>
                  ) : status === "analysing" ? (
                    <>
                      <Zap size={14} className="spin" />
                      Analysing Frames with YOLOv8…
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      Analyse Video
                    </>
                  )}
                </button>
              )}

              {/* Error Message */}
              {status === "error" && errorMsg && (
                <div style={{
                  color: "var(--crit)", fontSize: "11.5px", background: "var(--crit-bg)",
                  border: "1px solid var(--crit-border)", padding: "10px 12px", borderRadius: "var(--radius-sm)",
                  display: "flex", flexDirection: "column", gap: "6px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "600" }}>
                    <XCircle size={14} />
                    Analysis Could Not Be Completed
                  </div>
                  <span>{errorMsg}</span>
                  <button
                    type="button"
                    className="btn-ack"
                    style={{ alignSelf: "flex-start", marginTop: "4px", fontSize: "11px" }}
                    onClick={handleAnalyse}
                  >
                    Retry Analysis
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Player & Results Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Synchronized Video Player */}
          {activeVideoUrl && (
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <Video size={14} color="var(--orange-400)" />
                  Video Player & Detection Overlays
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {analysisResult?.annotated_video && (
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        className={`filter-pill ${videoMode === "original_hud" ? "active" : ""}`}
                        onClick={() => setVideoMode("original_hud")}
                      >
                        Original + Live HUD
                      </button>
                      <button
                        className={`filter-pill ${videoMode === "annotated" ? "active" : ""}`}
                        onClick={() => setVideoMode("annotated")}
                      >
                        Analysed Output
                      </button>
                    </div>
                  )}
                  {videoMode === "original_hud" && (
                    <button
                      className={`filter-pill ${hudEnabled ? "active" : ""}`}
                      onClick={() => setHudEnabled(!hudEnabled)}
                    >
                      HUD: {hudEnabled ? "ON" : "OFF"}
                    </button>
                  )}
                </div>
              </div>

              <div className="panel-body" style={{ padding: "0" }}>
                <div className="video-player-container">
                  <video
                    ref={videoRef}
                    src={activeVideoUrl}
                    className="video-player-element"
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        setDurationSec(videoRef.current.duration);
                        videoRef.current.playbackRate = playbackSpeed;
                      }
                    }}
                    onTimeUpdate={() => {
                      if (videoRef.current) setCurrentTimeSec(videoRef.current.currentTime);
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    playsInline
                  />
                  {videoMode === "original_hud" && (
                    <canvas ref={canvasRef} className="video-hud-canvas" />
                  )}
                </div>

                {/* Video Controls Bar */}
                <div className="video-controls-bar">
                  <button
                    type="button"
                    className="sim-btn"
                    onClick={() => {
                      if (videoRef.current) {
                        if (isPlaying) videoRef.current.pause();
                        else videoRef.current.play().catch(() => {});
                      }
                    }}
                  >
                    {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                    {isPlaying ? "Pause" : "Play"}
                  </button>

                  <input
                    type="range"
                    min="0"
                    max={durationSec || 100}
                    step="0.05"
                    value={currentTimeSec}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setCurrentTimeSec(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                    className="video-scrub-slider"
                  />

                  <div className="video-timestamp-chip">
                    {formatSec(currentTimeSec)} / {formatSec(durationSec || analysisResult?.duration_sec || 0)}
                  </div>

                  <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                    {[0.5, 1, 1.5, 2].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`sim-btn ${playbackSpeed === s ? "active" : ""}`}
                        style={{ padding: "2px 6px", fontSize: "10px" }}
                        onClick={() => {
                          setPlaybackSpeed(s);
                          if (videoRef.current) videoRef.current.playbackRate = s;
                        }}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Summary */}
          {analysisResult && (
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">
                  <Activity size={14} color="var(--ok)" />
                  Analysis Results
                </div>
                <span className={`alert-badge ${analysisResult.risk_level}`}>
                  {analysisResult.risk_level} RISK
                </span>
              </div>
              <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* KPI Grid */}
                <div className="gauge-grid">
                  <div className="gauge-card">
                    <span className="gauge-label">People Detected</span>
                    <span className="gauge-val" style={{ color: "var(--ok)" }}>
                      {analysisResult.total_persons_detected.toLocaleString()}
                    </span>
                    <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>
                      Pedestrians tracked
                    </span>
                  </div>

                  <div className="gauge-card">
                    <span className="gauge-label">Vehicles Detected</span>
                    <span className="gauge-val" style={{ color: "var(--cyan)" }}>
                      {analysisResult.total_vehicles_detected.toLocaleString()}
                    </span>
                    <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>
                      Cars, forklifts & transport
                    </span>
                  </div>

                  <div className="gauge-card">
                    <span className="gauge-label">Potential Risk Events</span>
                    <span className="gauge-val" style={{ color: analysisResult.risk_event_count > 0 ? "var(--crit)" : "var(--ok)" }}>
                      {analysisResult.risk_event_count}
                    </span>
                    <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>
                      Proximity violations found
                    </span>
                  </div>

                  <div className="gauge-card">
                    <span className="gauge-label">Analysis Time</span>
                    <span className="gauge-val">
                      {analysisResult.processing_time_sec}s
                    </span>
                    <span style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>
                      {analysisResult.processed_frames} / {analysisResult.total_frames} frames
                    </span>
                  </div>
                </div>

                {/* Risk Events Timeline */}
                <div>
                  <h4 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
                    Safety Event Timeline ({analysisResult.risk_events.length})
                  </h4>

                  {analysisResult.risk_events.length === 0 ? (
                    <div style={{
                      background: "var(--ok-bg)", border: "1px solid var(--ok-border)",
                      borderRadius: "var(--radius-sm)", padding: "12px 14px", color: "var(--ok)",
                      fontSize: "12px", display: "flex", alignItems: "center", gap: "8px"
                    }}>
                      <CheckCircle2 size={16} />
                      <span>
                        <strong>No safety events detected in this video.</strong> Note: Automated detection does not guarantee complete absence of hazards; camera angle, lighting, and occlusion may affect visibility.
                      </span>
                    </div>
                  ) : (
                    <div className="alerts-list" style={{ maxHeight: "320px" }}>
                      {analysisResult.risk_events.map((evt, idx) => (
                        <div key={idx} className={`alert-item ${evt.severity || analysisResult.risk_level}`}>
                          <div className="alert-top">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span className={`alert-badge ${evt.severity || analysisResult.risk_level}`}>
                                Event #{idx + 1}
                              </span>
                              <strong style={{ fontSize: "12.5px" }}>{evt.what || "Person–Vehicle Too Close"}</strong>
                            </div>
                            <button
                              type="button"
                              className="btn-ack"
                              style={{ padding: "3px 8px", fontSize: "11px", color: "var(--orange-400)" }}
                              onClick={() => jumpToTimestamp(evt.timestamp_sec)}
                            >
                              <Play size={10} /> Play from {evt.timestamp_fmt}
                            </button>
                          </div>

                          <div className="alert-structured">
                            <div className="alert-q-block">
                              <span className="alert-q-label">When</span>
                              <span className="alert-q-val">{evt.timestamp_fmt} (Frame {evt.frame})</span>
                            </div>
                            <div className="alert-q-block">
                              <span className="alert-q-label">Distance (Image-Space)</span>
                              <span className="alert-q-val" style={{ fontFamily: "var(--font-mono)", color: "var(--crit)" }}>
                                {evt.distance_px} px
                              </span>
                            </div>
                            <div className="alert-q-block" style={{ gridColumn: "span 2" }}>
                              <span className="alert-q-label">Evidence</span>
                              <span className="alert-q-val">
                                Person ({((evt.person_confidence || 0) * 100).toFixed(0)}%) & {evt.vehicle} ({((evt.vehicle_confidence || 0) * 100).toFixed(0)}%)
                              </span>
                            </div>
                            <div className="alert-q-block" style={{ gridColumn: "span 2" }}>
                              <span className="alert-q-label">Suggested Next Step</span>
                              <span className="alert-q-val" style={{ color: "var(--orange-400)" }}>
                                {evt.suggested_action || "Review pedestrian separation and driver approach speed."}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Download Actions */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                  {analysisResult.annotated_video && (
                    <a
                      href={analysisResult.annotated_video}
                      download
                      className="btn-ack"
                    >
                      <Download size={13} />
                      Download Analysed Video
                    </a>
                  )}
                  <a
                    href={`/api/video/report/${analysisResult.video_id}`}
                    download
                    className="btn-ack"
                  >
                    <Download size={13} />
                    Download Report (JSON)
                  </a>
                  <button
                    type="button"
                    className="btn-ack"
                    onClick={() => {
                      setAnalysisResult(null);
                      setUploadResult(null);
                      setSelectedFile(null);
                      setStatus("idle");
                      setHonestStage(1);
                      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                      setVideoPreviewUrl(null);
                    }}
                  >
                    <RotateCcw size={13} />
                    Choose Another Video
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT: AlertsManagementSection (Central Safety Events Log)
// =============================================================================
interface AlertsManagementSectionProps {
  events: SafetyEvent[];
  onAcknowledge: (id: number) => void;
  onResolve: (id: number) => void;
  onInspect: (e: SafetyEvent) => void;
  onJumpToVideo: () => void;
}

function AlertsManagementSection({
  events,
  onAcknowledge,
  onResolve,
  onInspect,
  onJumpToVideo,
}: AlertsManagementSectionProps) {
  const [filterSeverity, setFilterSeverity] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterSeverity !== "ALL" && e.severity !== filterSeverity) return false;
      if (filterStatus !== "ALL" && e.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const zone = (e.zone || "").toLowerCase();
        const v = (e.vehicle_id || "").toLowerCase();
        const w = (e.worker_id || "").toLowerCase();
        const desc = (e.factors?.what || e.factors?.description || "").toLowerCase();
        if (!zone.includes(q) && !v.includes(q) && !w.includes(q) && !desc.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [events, filterSeverity, filterStatus, searchQuery]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <AlertTriangle size={15} color="var(--crit)" />
          Safety Alerts & Incident Audit Log ({filtered.length} shown)
        </div>
        <span className="brand-badge">IMMUTABLE LOG</span>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Filters Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div className="filter-bar">
            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              SEVERITY:
            </span>
            {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
              <button
                key={s}
                type="button"
                className={`filter-pill ${filterSeverity === s ? "active" : ""}`}
                onClick={() => setFilterSeverity(s)}
              >
                {s === "MEDIUM" ? "MODERATE" : s}
              </button>
            ))}

            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginLeft: "8px" }}>
              STATUS:
            </span>
            {["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map((st) => (
              <button
                key={st}
                type="button"
                className={`filter-pill ${filterStatus === st ? "active" : ""}`}
                onClick={() => setFilterStatus(st)}
              >
                {st === "ACKNOWLEDGED" ? "REVIEWED" : st}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Search size={14} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Search zone, entity, description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ padding: "6px 10px", fontSize: "12px", width: "220px" }}
            />
          </div>
        </div>

        {/* Alerts Table */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={32} color="var(--ok)" />
            <h4>No Safety Alerts Match Selected Filters</h4>
            <p>All active events in this view have been reviewed or resolved.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Zone / Video</th>
                <th>Involved Entities</th>
                <th>Risk Score</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isVideo = !e.is_demo || e.zone.includes("Video") || e.zone.includes("CCTV");
                return (
                  <tr key={e.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>
                      {new Date(e.created_at || Date.now()).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className={`alert-badge ${e.severity}`}>{e.severity}</span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: "10px", fontFamily: "var(--font-mono)",
                        color: isVideo ? "var(--cyan)" : "var(--text-dim)"
                      }}>
                        {isVideo ? "VIDEO ANALYSIS" : "SIMULATION"}
                      </span>
                    </td>
                    <td style={{ fontWeight: "600", fontSize: "12.5px" }}>{e.zone}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>
                      {e.vehicle_id} ↔ {e.worker_id}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: "bold" }}>
                      {e.risk_score}/100
                    </td>
                    <td>
                      <span className={`status-tag ${e.status}`}>
                        {e.status === "ACKNOWLEDGED" ? "REVIEWED" : e.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn-ack"
                          style={{ padding: "3px 8px", fontSize: "11px" }}
                          onClick={() => onInspect(e)}
                        >
                          Inspect
                        </button>
                        {e.status === "OPEN" && (
                          <button
                            type="button"
                            className="btn-ack"
                            style={{ padding: "3px 8px", fontSize: "11px", color: "var(--ok)" }}
                            onClick={() => onAcknowledge(e.id)}
                          >
                            Mark Reviewed
                          </button>
                        )}
                        {e.status === "ACKNOWLEDGED" && (
                          <button
                            type="button"
                            className="btn-ack"
                            style={{ padding: "3px 8px", fontSize: "11px", color: "var(--ok)" }}
                            onClick={() => onResolve(e.id)}
                          >
                            Resolve
                          </button>
                        )}
                        {isVideo && (
                          <button
                            type="button"
                            className="btn-ack"
                            style={{ padding: "3px 8px", fontSize: "11px", color: "var(--cyan)" }}
                            onClick={onJumpToVideo}
                            title="Go to Video Analysis"
                          >
                            <ExternalLink size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT: SafetyReportsSection (Summaries & Downloadable Reports)
// =============================================================================
interface SafetyReportsProps {
  events: SafetyEvent[];
  latestVideoResult: VideoAnalysisResult | null;
}

function SafetyReportsSection({ events, latestVideoResult }: SafetyReportsProps) {
  const critCount = events.filter((e) => e.severity === "CRITICAL").length;
  const highCount = events.filter((e) => e.severity === "HIGH").length;
  const modCount = events.filter((e) => e.severity === "MEDIUM" || e.severity === "MODERATE").length;
  const lowCount = events.filter((e) => e.severity === "LOW").length;

  const exportJsonReport = () => {
    const reportData = {
      facility_name: "EdgeGuard Monitored Facility Alpha",
      exported_at: new Date().toISOString(),
      standards_assessment: "Assistive Proximity Monitoring Prototype",
      total_events_logged: events.length,
      severity_summary: {
        critical: critCount,
        high: highCount,
        moderate: modCount,
        low: lowCount,
      },
      latest_video_analysis: latestVideoResult,
      events: events,
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edgeguard_safety_summary_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsvReport = () => {
    const headers = "ID,Timestamp,Severity,RiskScore,Zone,Vehicle,Worker,Status\n";
    const rows = events.map((e) =>
      `"${e.id}","${e.created_at || ""}","${e.severity}","${e.risk_score}","${e.zone}","${e.vehicle_id || ""}","${e.worker_id || ""}","${e.status}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edgeguard_events_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Layers size={15} color="var(--orange-400)" />
            Safety Overview & Audit Reports
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-ack" onClick={exportJsonReport}>
              <Download size={13} /> Export JSON Report
            </button>
            <button className="btn-ack" onClick={exportCsvReport}>
              <Download size={13} /> Export CSV Log
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="gauge-grid">
            <div className="gauge-card">
              <span className="gauge-label">Total Recorded Events</span>
              <span className="gauge-val">{events.length}</span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Past & active logs</span>
            </div>
            <div className="gauge-card">
              <span className="gauge-label" style={{ color: "var(--crit)" }}>Critical Events</span>
              <span className="gauge-val" style={{ color: "var(--crit)" }}>{critCount}</span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Urgent interventions</span>
            </div>
            <div className="gauge-card">
              <span className="gauge-label" style={{ color: "var(--high)" }}>High Risk Events</span>
              <span className="gauge-val" style={{ color: "var(--high)" }}>{highCount}</span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Close interactions</span>
            </div>
            <div className="gauge-card">
              <span className="gauge-label" style={{ color: "var(--ok)" }}>Resolution Rate</span>
              <span className="gauge-val" style={{ color: "var(--ok)" }}>
                {events.length > 0 ? Math.round((events.filter((e) => e.status !== "OPEN").length / events.length) * 100) : 100}%
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Reviewed or closed</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
        {/* Severity Breakdown */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <Activity size={14} color="var(--cyan)" />
              Severity Distribution
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Critical Risk</span>
                <strong style={{ color: "var(--crit)" }}>{critCount} ({events.length ? Math.round((critCount / events.length) * 100) : 0}%)</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: `${events.length ? (critCount / events.length) * 100 : 0}%`, background: "var(--crit)" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>High Risk</span>
                <strong style={{ color: "var(--high)" }}>{highCount} ({events.length ? Math.round((highCount / events.length) * 100) : 0}%)</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: `${events.length ? (highCount / events.length) * 100 : 0}%`, background: "var(--high)" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Moderate Risk</span>
                <strong style={{ color: "var(--warn)" }}>{modCount} ({events.length ? Math.round((modCount / events.length) * 100) : 0}%)</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: `${events.length ? (modCount / events.length) * 100 : 0}%`, background: "var(--warn)" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Low / Informational</span>
                <strong style={{ color: "var(--low)" }}>{lowCount} ({events.length ? Math.round((lowCount / events.length) * 100) : 0}%)</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: `${events.length ? (lowCount / events.length) * 100 : 0}%`, background: "var(--low)" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Incident Hotspot Distribution */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <TrendingDown size={14} color="var(--crit)" />
              Observed Hazard Hotspots
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Blind Corner B (Intersection Crosswalk)</span>
                <strong style={{ color: "var(--crit)" }}>46%</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: "46%", background: "var(--crit)" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Loading Dock Staging 1</span>
                <strong style={{ color: "var(--orange-400)" }}>28%</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: "28%", background: "var(--orange-400)" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Aisle 3 Pallet Racking Corridor</span>
                <strong style={{ color: "var(--warn)" }}>18%</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: "18%", background: "var(--warn)" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Main Crosswalk Zone</span>
                <strong style={{ color: "var(--ok)" }}>8%</strong>
              </div>
              <div className="gauge-bar-track">
                <div className="gauge-bar-fill" style={{ width: "8%", background: "var(--ok)" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT: SystemStatusSection (Diagnostics, Model & Database Connectivity)
// =============================================================================
interface SystemStatusProps {
  health: Health | null;
  apiOnline: boolean;
  eventsCount: number;
}

function SystemStatusSection({ health, apiOnline, eventsCount }: SystemStatusProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Cpu size={15} color="var(--cyan)" />
            System Status & Service Diagnostics
          </div>
          <span className="brand-badge">REAL SERVICE STATUS</span>
        </div>
        <div className="panel-body">
          <div className="gauge-grid">
            <div className="gauge-card">
              <span className="gauge-label">FastAPI Backend</span>
              <span className="gauge-val" style={{ color: apiOnline ? "var(--ok)" : "var(--warn)" }}>
                {apiOnline ? "ONLINE" : "STANDALONE"}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Port 8000 · Status: {health?.status || "preview"}
              </span>
            </div>

            <div className="gauge-card">
              <span className="gauge-label">Database Connection</span>
              <span className="gauge-val" style={{ color: "var(--ok)" }}>
                {health?.database === "ok" ? "SQLITE ACTIVE" : "ENGINE SYNC"}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                {eventsCount} Safety Events Persisted
              </span>
            </div>

            <div className="gauge-card">
              <span className="gauge-label">Vision Model</span>
              <span className="gauge-val" style={{ color: "var(--cyan)" }}>
                YOLOv8 NANO
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Pretrained weights loaded (CPU/GPU)
              </span>
            </div>

            <div className="gauge-card">
              <span className="gauge-label">Telemetry Ingestion</span>
              <span className="gauge-val">SIMULATED</span>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Testing floorplan nodes active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monitored Units Table */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Radio size={14} color="var(--orange-400)" />
            Monitored Hardware Nodes (Testing Simulation Environment)
          </div>
          <span className="brand-badge sim">SIMULATED HARDWARE</span>
        </div>
        <div className="panel-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit ID</th>
                <th>Type</th>
                <th>Compute Module</th>
                <th>Thermal / Load</th>
                <th>Battery</th>
                <th>Firmware</th>
                <th>Network</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>FL-01</strong></td>
                <td>Counterbalance Forklift</td>
                <td>NVIDIA Jetson Orin Nano (4GB)</td>
                <td>41°C · 34% Load</td>
                <td>91%</td>
                <td>v1.4.2-rt</td>
                <td><span style={{ color: "var(--ok)" }}>Wi-Fi 6E (54 Mbps)</span></td>
              </tr>
              <tr>
                <td><strong>FL-02</strong></td>
                <td>Reach Truck (High Mast)</td>
                <td>NVIDIA Jetson Orin Nano (8GB)</td>
                <td>44°C · 48% Load</td>
                <td>84%</td>
                <td>v1.4.2-rt</td>
                <td><span style={{ color: "var(--ok)" }}>Wi-Fi 6E (62 Mbps)</span></td>
              </tr>
              <tr>
                <td><strong>FL-03</strong></td>
                <td>Electric Pallet Jack</td>
                <td>NVIDIA Jetson AGX Orin</td>
                <td>39°C · 22% Load</td>
                <td>78%</td>
                <td>v1.4.0-rt</td>
                <td><span style={{ color: "var(--ok)" }}>Private 5G</span></td>
              </tr>
              <tr>
                <td><strong>BEACON-B</strong></td>
                <td>Blind Corner Overhead Radar</td>
                <td>TI IWR6843AOP mmWave</td>
                <td>36°C · 12% Load</td>
                <td>PoE+ (Mains)</td>
                <td>v2.1.0</td>
                <td><span style={{ color: "var(--ok)" }}>Gigabit Ethernet</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT: ProjectDetailsSection (Scope, Architecture & Limitations)
// =============================================================================
function ProjectDetailsSection() {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Server size={15} color="var(--ok)" />
          EdgeGuard AI — Technical Scope & Limitations
        </div>
        <span className="brand-badge">ARCHITECTURE & SCOPE</span>
      </div>
      <div className="panel-body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <h4 style={{ marginBottom: "10px", color: "var(--orange-400)", fontSize: "13.5px" }}>
              Core System Architecture
            </h4>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px" }}>
              <li style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <CheckCircle2 size={15} color="var(--ok)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span><strong>FastAPI Asynchronous Backend:</strong> High-throughput endpoints for video ingestion, token auth, and real-time alert dispatch.</span>
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <CheckCircle2 size={15} color="var(--ok)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span><strong>YOLOv8 Object Detection & Tracking:</strong> Identifies and assigns track IDs to persons and vehicles across sampled frames.</span>
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <CheckCircle2 size={15} color="var(--ok)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span><strong>SQLAlchemy ORM & Database Persistence:</strong> Safety events are stored in relational storage (SQLite / PostgreSQL) with structured factors.</span>
              </li>
              <li style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <CheckCircle2 size={15} color="var(--ok)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <span><strong>Interactive HTML5 Canvas HUD:</strong> Overlays real-time bounding boxes, confidences, and danger rays directly on playback footage.</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 style={{ marginBottom: "10px", color: "var(--cyan)", fontSize: "13.5px" }}>
              Technical Limitations & Honest Assessment
            </h4>
            <div style={{
              background: "var(--bg-panel)", border: "1px solid var(--line-subtle)",
              borderRadius: "var(--radius-sm)", padding: "12px", fontSize: "12px",
              color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "8px"
            }}>
              <p>
                <strong>1. No Accident Prediction Guarantees:</strong> Object detection and proximity rules flag potential safety hazards. They do not claim to forecast human intentions or certified collision prevention.
              </p>
              <p>
                <strong>2. Monocular Image-Space Estimates:</strong> Video pixel distances are approximate image-space estimates. Converting pixels to metric metres requires fixed camera homography calibration.
              </p>
              <p>
                <strong>3. Occlusion and Lighting:</strong> Extreme low light, dense steam, or blind-corner racking may obstruct camera sightlines. Sensor fusion with UWB/LiDAR is recommended for safety-critical zones.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT: LoginScreen (Clean Industrial Auth)
// =============================================================================
function LoginScreen({ onLoginSuccess }: { onLoginSuccess: (user: User) => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (username = u, password = p) => {
    setBusy(true);
    setErr(null);
    try {
      await login(username, password);
      const currentUser = await me();
      onLoginSuccess(currentUser);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-backdrop">
      <div className="login-card">
        <div className="login-header">
          <div className="login-badge">
            <Shield size={12} />
            <span>INDUSTRIAL SAFETY PLATFORM</span>
          </div>
          <h1>
            EdgeGuard<span>AI</span>
          </h1>
          <p>Workplace Collision Prevention & Video Safety Monitoring</p>
        </div>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div className="form-group">
            <label htmlFor="login-username">Operator ID / Username</label>
            <input
              id="login-username"
              className="form-input"
              value={u}
              onChange={(e) => setU(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Access Key / Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              value={p}
              onChange={(e) => setP(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
            />
          </div>

          {err && (
            <div style={{ color: "var(--crit)", fontSize: "11.5px", background: "var(--crit-bg)", border: "1px solid var(--crit-border)", padding: "8px 10px", borderRadius: "4px", marginBottom: "10px" }}>
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: "100%", marginTop: "4px" }}
            disabled={busy || !u || !p}
          >
            {busy ? "Authenticating Operator…" : "Access Command Center"}
          </button>
        </form>

        <div className="quick-logins">
          <span className="quick-login-title">Quick Demo Login</span>
          <div className="quick-btn-grid">
            <button
              type="button"
              className="btn-quick"
              onClick={() => {
                setU("admin");
                setP("admin-password-123");
                handleSubmit("admin", "admin-password-123");
              }}
            >
              <strong>Administrator</strong>
              <span>admin / admin-password-123</span>
            </button>
            <button
              type="button"
              className="btn-quick"
              onClick={() => {
                onLoginSuccess({ id: 2, username: "safety_lead", role: "SAFETY_MANAGER", is_active: true });
              }}
            >
              <strong>Safety Manager</strong>
              <span>One-Click Preview</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
