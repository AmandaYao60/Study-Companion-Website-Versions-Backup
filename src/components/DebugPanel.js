"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDebug, useMonitoring, useSession } from "../context/AppContext";
import { DATA_QUALITY, EMOTION_LABELS } from "../services/session/sessionConstants";
import {
  DEBUG_SIMULATION_MODE,
  DEBUG_SIMULATION_PRESETS,
} from "../services/debug/debugSimulation";
import { formatSanitizedDebugLog } from "../services/debug/debugEventLog";
import {
  DIAGNOSTIC_STATE,
  getFaceDetectionDiagnosticState,
  getFreshnessState,
} from "../services/debug/debugDiagnostics";

const statusStyles = {
  ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  valid: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  active: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  on: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  loading: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  requesting: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  writing: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  partial: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  limited: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  paused: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  "recovery-pending": "border-amber-400/20 bg-amber-400/10 text-amber-200",
  "collecting-baseline": "border-amber-400/20 bg-amber-400/10 text-amber-200",
  "insufficient-face-coverage": "border-amber-400/20 bg-amber-400/10 text-amber-200",
  "insufficient-observations": "border-amber-400/20 bg-amber-400/10 text-amber-200",
  stale: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  error: "border-red-400/20 bg-red-400/10 text-red-200",
  "model-unavailable": "border-red-400/20 bg-red-400/10 text-red-200",
  yes: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  no: "border-red-400/20 bg-red-400/10 text-red-200",
  off: "border-white/10 bg-slate-900 text-slate-300",
  idle: "border-white/10 bg-slate-900 text-slate-300",
  unavailable: "border-white/10 bg-slate-900 text-slate-300",
};

const statusLabels = {
  "collecting-baseline": "Collecting baseline",
  "insufficient-face-coverage": "Insufficient face coverage",
  "insufficient-observations": "Insufficient observations",
  "model-unavailable": "Model unavailable",
};

const dataQualityLabel = (value) => {
  if (value === DATA_QUALITY.GOOD) return "valid";
  if (value === DATA_QUALITY.PARTIAL) return "partial";
  if (value === "limited") return "partial";
  return "unavailable";
};

const formatPercent = (value) => (
  Number.isFinite(value) ? `${Math.round(value)}%` : "N/A"
);

const formatSigned = (value) => (
  Number.isFinite(value) ? value.toFixed(2) : "N/A"
);

const formatConfidence = (value) => (
  Number.isFinite(value) ? `${Math.round(value * 100)}%` : "N/A"
);

const formatElapsed = (ms) => {
  const value = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

const formatTimestamp = (value) => {
  if (!value) return "N/A";
  const time = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time)) return "N/A";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(time));
};

const formatAge = (value, now) => {
  if (!value) return "N/A";
  const time = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time)) return "N/A";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
};

const formatNumber = (value, digits = 2) => (
  Number.isFinite(value) ? value.toFixed(digits) : "N/A"
);

const formatSecondPair = (currentMs, targetMs) => {
  if (!Number.isFinite(currentMs) || !Number.isFinite(targetMs) || targetMs <= 0) return "N/A";
  return `${Math.round(currentMs / 1000)} / ${Math.round(targetMs / 1000)} s`;
};

function StatusBadge({ value }) {
  const label = value || "unavailable";
  const className = statusStyles[label] || statusStyles.unavailable;
  return (
    <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${className}`}>
      {statusLabels[label] || label}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <h3 className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function KeyValue({ label, value, status }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/55 px-3 py-2">
      <span className="min-w-0 text-[11px] font-semibold text-slate-400">{label}</span>
      {status ? <StatusBadge value={status} /> : <span className="text-right text-xs font-bold text-white">{value}</span>}
    </div>
  );
}

function MetricCard({ label, value, detail, simulated }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        {simulated && (
          <span className="rounded border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-200">
            Simulated
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      {detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}
    </div>
  );
}

function Subsection({ title, children }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/35 p-3">
      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{title}</h4>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function SliderControl({ label, value, min, max, step, formatter, disabled, onChange }) {
  return (
    <label className="block rounded-xl border border-white/5 bg-slate-900/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className="font-mono text-xs font-bold text-white">{formatter(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </label>
  );
}

export default function DebugPanel() {
  const {
    isDebugMode,
    debugLiveMetrics,
    debugDisplayMetrics,
    debugSimulation,
    debugDiagnosticSnapshot,
    setDebugSimulationEnabled,
    setDebugSimulationMetric,
    applyDebugSimulationPreset,
    resetDebugSimulation,
    isSensitiveDebugPreviewEnabled,
    setSensitiveDebugPreviewEnabled,
    resolvedDebugMetrics,
    clearAllDebugMetricOverrides,
    telemetryTable,
    rawLandmarksHistory,
    exportTelemetryCSV,
    eventLog,
    addLog,
    clearEventLog,
  } = useDebug();
  const {
    isMonitoring,
    isCameraAllowed,
    cameraStatus,
    showCameraDialog,
    isAiLoaded,
    aiLoadingProgress,
    aiError,
    faceLandmarkerStatus,
    gestureRecognizerStatus,
    affectModelStatus,
    hasDetectedFace,
    runtimeStatus,
    blinkRate,
    eyeOpenness,
    headPose,
    currentGesture,
    fps,
    inferenceFps,
    setInferenceFps,
  } = useMonitoring();
  const {
    activeSession,
    activeSessionSamples,
    sessionClock,
    getSessionElapsedMs,
    sessionRepositoryKind,
    checkpointStatus,
  } = useSession();

  const [isOpenRequested, setIsOpenRequested] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [now, setNow] = useState(0);
  const [isAdvancedControlsOpen, setIsAdvancedControlsOpen] = useState(false);
  const [isSensitiveSectionOpen, setIsSensitiveSectionOpen] = useState(false);
  const openButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const isOpen = isDebugMode && isOpenRequested;

  useEffect(() => {
    if (isDebugMode) return undefined;
    const timer = window.setTimeout(() => {
      setIsOpenRequested(false);
      setCopyStatus("");
      setIsAdvancedControlsOpen(false);
      setIsSensitiveSectionOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isDebugMode]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement;
    drawerRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpenRequested(false);
        setSensitiveDebugPreviewEnabled(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
  }, [isOpen, setSensitiveDebugPreviewEnabled]);

  const latestSample = activeSessionSamples[activeSessionSamples.length - 1] || null;
  const latestSampleTime = latestSample?.intervalEndedAt || latestSample?.recordedAt || null;
  const displayMetrics = debugDisplayMetrics.metrics;
  const simulationMetrics = debugSimulation.metrics;
  const isSimulationEnabled = debugDisplayMetrics.mode === DEBUG_SIMULATION_MODE.SIMULATION;
  const diagnostic = debugDiagnosticSnapshot;
  const diagnosticFreshness = getFreshnessState(diagnostic.updatedAt, now);
  const sessionStatus = !activeSession
    ? "none"
    : activeSession.recoveryPending
      ? "recovery-pending"
      : activeSession.status;
  const elapsedMs = getSessionElapsedMs();
  const durableElapsedMs = activeSession?.accumulatedStudyMs ?? sessionClock.accumulatedMs ?? 0;
  const faceStatus = getFaceDetectionDiagnosticState({
    isMonitoring,
    isCameraAllowed,
    isAiLoaded,
    hasDetectedFace,
    updatedAt: diagnostic.updatedAt,
    now,
  });
  const dataQualityStatus = dataQualityLabel(debugLiveMetrics.dataQuality);
  const latestObservationCount = latestSample?.expectedObservationCount ?? diagnostic.aggregation.expectedObservationCount;
  const acceptedObservationCount = latestSample?.validObservationCount ?? diagnostic.aggregation.acceptedObservationCount;
  const affectObservationCount = latestSample?.affectObservationCount ?? diagnostic.aggregation.validAffectObservations;

  const systemRows = useMemo(() => ([
    ["Camera", showCameraDialog && cameraStatus === "off" ? "off" : cameraStatus],
    ["FaceLandmarker", faceLandmarkerStatus],
    ["GestureRecognizer", gestureRecognizerStatus],
    ["Affect model", affectModelStatus],
    ["Face detected", faceStatus],
    ["Monitoring", isMonitoring ? "on" : "off"],
    ["Session", sessionStatus],
    ["Repository", sessionRepositoryKind || "memory"],
    ["Data quality", dataQualityStatus],
  ]), [
    affectModelStatus,
    cameraStatus,
    dataQualityStatus,
    faceLandmarkerStatus,
    faceStatus,
    gestureRecognizerStatus,
    isMonitoring,
    sessionRepositoryKind,
    sessionStatus,
    showCameraDialog,
  ]);

  const isDeveloperDebugAvailable = process.env.NODE_ENV !== "production";
  if (!isDeveloperDebugAvailable || !isDebugMode) return null;

  const handleCopyLog = async () => {
    const text = formatSanitizedDebugLog(eventLog);
    try {
      await navigator.clipboard.writeText(text || "No diagnostic events.");
      setCopyStatus("Copied");
      addLog("Sanitized diagnostic log copied.", "debug");
    } catch {
      setCopyStatus("Copy failed");
      addLog("Could not copy sanitized diagnostic log.", "error");
    }
  };

  const handleClose = () => {
    setIsOpenRequested(false);
    setSensitiveDebugPreviewEnabled(false);
    setIsSensitiveSectionOpen(false);
  };

  const handleExportLandmarks = () => {
    const confirmed = window.confirm(
      "Export raw face and hand landmark coordinates from the in-memory debug buffer? This data is sensitive and should stay local."
    );
    if (confirmed) {
      exportTelemetryCSV();
    }
  };

  const renderPreview = (metrics, simulated = false) => (
    <div className="grid grid-cols-2 gap-2">
      <MetricCard label="Attention" value={formatPercent(metrics.attention)} simulated={simulated} />
      <MetricCard label="Fatigue" value={formatPercent(metrics.fatigue)} simulated={simulated} />
      <MetricCard label="Valence" value={formatSigned(metrics.valence)} simulated={simulated} />
      <MetricCard label="Arousal" value={formatSigned(metrics.arousal)} simulated={simulated} />
      <MetricCard
        label="Emotion"
        value={metrics.emotion || "N/A"}
        detail={`Top emotion probability: ${formatConfidence(metrics.emotionConfidence)}`}
        simulated={simulated}
      />
      <MetricCard
        label="Detection"
        value={simulated
          ? (metrics.faceDetected ? "Face" : "No face")
          : faceStatus === "yes"
            ? "Face"
            : faceStatus === "no"
              ? "No face"
              : statusLabels[faceStatus] || faceStatus || "N/A"}
        detail={metrics.handDetected ? "Hand detected" : `Quality: ${metrics.dataQuality}`}
        simulated={simulated}
      />
    </div>
  );

  return (
    <>
      <button
        ref={openButtonRef}
        type="button"
        aria-label="Open developer diagnostics"
        aria-expanded={isOpen}
        onClick={() => {
          setNow(Date.now());
          setIsOpenRequested(true);
        }}
        className="fixed bottom-4 right-4 z-[60] rounded-full border border-cyan-400/30 bg-cyan-400 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-2xl shadow-cyan-950/40 transition-all hover:bg-cyan-300"
      >
        Diagnostics
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[65] bg-slate-950/45 backdrop-blur-sm" role="presentation">
          <aside
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="false"
            aria-labelledby="debug-panel-title"
            className="fixed inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl border border-white/10 bg-slate-950 text-slate-100 shadow-2xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[min(460px,calc(100vw-2rem))] sm:rounded-l-2xl sm:rounded-tr-none"
          >
            <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Debug Mode</p>
                <h2 id="debug-panel-title" className="mt-1 text-lg font-black text-white">Developer Diagnostics</h2>
                <p className="mt-1 text-xs text-slate-500">Read-only pipeline status plus isolated UI simulation.</p>
              </div>
              <button
                type="button"
                aria-label="Close developer diagnostics"
                onClick={handleClose}
                className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-800"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <Section title="System Status">
                <Subsection title="Pipeline Health">
                  <div className="grid grid-cols-1 gap-2">
                    {systemRows.map(([label, status]) => (
                      <KeyValue key={label} label={label} status={status} />
                    ))}
                    <KeyValue label="Diagnostic snapshot" status={diagnosticFreshness.state} />
                    <KeyValue label="Latest formal sample" value={formatAge(latestSampleTime, now)} />
                    <KeyValue label="Runtime" value={runtimeStatus || "idle"} />
                    {!isAiLoaded && (
                      <KeyValue label={aiError ? "AI load error" : "AI load progress"} value={aiError || `${aiLoadingProgress}%`} />
                    )}
                  </div>
                </Subsection>
              </Section>

              <Section title="Live Metrics">
                <Subsection title="Authoritative Pipeline Values">
                  <div>{renderPreview(debugLiveMetrics, false)}</div>
                </Subsection>
                {isSimulationEnabled && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Simulated display preview</p>
                    <div className="mt-3">{renderPreview(displayMetrics, true)}</div>
                  </div>
                )}
                <Subsection title="Observed Signals">
                  <div className="grid grid-cols-1 gap-2">
                    <KeyValue label="Latest observation" value={formatAge(debugLiveMetrics.latestObservationAt, now)} />
                    <KeyValue label="Face detection" status={faceStatus} />
                    <KeyValue label="Hand detection" value={diagnostic.gesture.detectedHandCount > 0 ? `${diagnostic.gesture.detectedHandCount} hand(s)` : "No hands"} />
                    <KeyValue label="Head pose" value={`Y ${headPose.yaw} / P ${headPose.pitch} / R ${headPose.roll}`} />
                    <KeyValue label="Eye and blink" value={`${formatPercent(eyeOpenness * 100)} eye, ${blinkRate} blinks/min`} />
                    <KeyValue label="Gesture" value={diagnostic.gesture.primaryGesture || currentGesture || "None"} />
                    <KeyValue label="Two-hand frames" value={diagnostic.gesture.twoHandFrames} />
                  </div>
                </Subsection>

                <Subsection title="Metric Explanation">
                  <div className="grid grid-cols-1 gap-2">
                    <KeyValue label="Attention status" status={diagnostic.attention.status} />
                    <KeyValue label="Attention raw / final" value={`${formatNumber(diagnostic.attention.raw, 1)} / ${formatPercent(diagnostic.attention.value)}`} />
                    <KeyValue label="Face coverage" value={`${formatPercent(diagnostic.attention.facePresenceScore)} (${diagnostic.aggregation.validFaceObservations} / ${diagnostic.aggregation.totalObservations})`} />
                    <KeyValue label="Forward pose score" value={formatPercent(diagnostic.attention.forwardPoseScore)} />
                    <KeyValue label="Head stability score" value={formatPercent(diagnostic.attention.headStabilityScore)} />
                    <KeyValue label="Fatigue status" status={diagnostic.fatigue.status} />
                    <KeyValue label="Eye baseline" value={diagnostic.fatigue.calibrationStatus === DIAGNOSTIC_STATE.COLLECTING_BASELINE ? `Collecting (${formatSecondPair(diagnostic.fatigue.calibrationElapsedMs, diagnostic.fatigue.calibrationTargetMs)}; ${diagnostic.fatigue.calibrationSampleCount} / ${diagnostic.fatigue.calibrationMinimumSamples} samples)` : formatNumber(diagnostic.fatigue.baselineEAR, 3)} />
                    <KeyValue label="EAR current / baseline" value={`${formatNumber(diagnostic.fatigue.averageEAR, 3)} / ${formatNumber(diagnostic.fatigue.baselineEAR, 3)}`} />
                    <KeyValue label="PERCLOS / closed-eye ratio" value={`${formatPercent(diagnostic.fatigue.perclosScore)} / ${formatNumber(diagnostic.fatigue.closedEyeRatio, 3)}`} />
                    <KeyValue label="Long closures" value={diagnostic.fatigue.longEyeClosureCount} />
                    <KeyValue label="Blink rate current / baseline" value={`${formatNumber(diagnostic.fatigue.currentBlinkRate, 1)} / ${formatNumber(diagnostic.fatigue.baselineBlinkRate, 1)}`} />
                    <KeyValue label="Fatigue raw / final" value={`${formatNumber(diagnostic.fatigue.raw, 1)} / ${formatPercent(diagnostic.fatigue.value)}`} />
                    <KeyValue label="Affect status" status={diagnostic.affect.status} />
                    <KeyValue label="Valence raw / final" value={`${formatSigned(diagnostic.affect.rawValence)} / ${formatSigned(diagnostic.affect.valence)}`} />
                    <KeyValue label="Arousal raw / final" value={`${formatSigned(diagnostic.affect.rawArousal)} / ${formatSigned(diagnostic.affect.arousal)}`} />
                    <KeyValue
                      label="Top emotion probabilities"
                      value={diagnostic.affect.topEmotionProbabilities.length > 0
                        ? diagnostic.affect.topEmotionProbabilities.map((entry) => `${entry.emotion} ${formatConfidence(entry.probability)}`).join(", ")
                        : "N/A"}
                    />
                    <KeyValue label="Affect source" value={diagnostic.affect.source || "Model unavailable"} />
                  </div>
                </Subsection>

                <Subsection title="Aggregation Quality">
                  <div className="grid grid-cols-1 gap-2">
                    <KeyValue label="Latest aggregation" value={formatAge(debugLiveMetrics.latestSampleAt, now)} />
                    <KeyValue label="Observation window coverage" value={formatConfidence(diagnostic.aggregation.observationWindowCoverage)} />
                    <KeyValue label="Valid face observations" value={`${diagnostic.aggregation.validFaceObservations} / ${diagnostic.aggregation.totalObservations}`} />
                    <KeyValue label="Formal accepted observations" value={`${acceptedObservationCount} / ${latestObservationCount}`} />
                    <KeyValue label="Formal affect observations" value={affectObservationCount} />
                    <KeyValue label="Data quality" status={dataQualityStatus} />
                    <KeyValue label="Target inference FPS" value={inferenceFps} />
                    <KeyValue label="Measured processing FPS" value={Number.isFinite(diagnostic.performance.measuredProcessingFps) ? diagnostic.performance.measuredProcessingFps : fps || "N/A"} />
                    <KeyValue label="MediaPipe latency" value={Number.isFinite(diagnostic.performance.mediaPipeLatencyMs) ? `${diagnostic.performance.mediaPipeLatencyMs} ms` : "N/A"} />
                    <KeyValue label="Affect-model latency" value={Number.isFinite(diagnostic.performance.affectLatencyMs) ? `${diagnostic.performance.affectLatencyMs} ms` : "N/A"} />
                  </div>
                </Subsection>
              </Section>

              <Section title="Safe Simulation Controls">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-slate-900/45 p-1">
                  <button
                    type="button"
                    onClick={() => setDebugSimulationEnabled(false)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${!isSimulationEnabled ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Live Input
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebugSimulationEnabled(true)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${isSimulationEnabled ? "bg-amber-300 text-slate-950" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Debug Simulation
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(DEBUG_SIMULATION_PRESETS).map(([presetId, preset]) => (
                    <button
                      key={presetId}
                      type="button"
                      onClick={() => applyDebugSimulationPreset(presetId)}
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-[10px] font-bold text-slate-300 transition-all hover:border-amber-300/30 hover:text-amber-100"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <SliderControl
                  label="Attention"
                  value={simulationMetrics.attention}
                  min={0}
                  max={100}
                  step={1}
                  formatter={formatPercent}
                  disabled={!isSimulationEnabled}
                  onChange={(value) => setDebugSimulationMetric("attention", value)}
                />
                <SliderControl
                  label="Fatigue"
                  value={simulationMetrics.fatigue}
                  min={0}
                  max={100}
                  step={1}
                  formatter={formatPercent}
                  disabled={!isSimulationEnabled}
                  onChange={(value) => setDebugSimulationMetric("fatigue", value)}
                />
                <SliderControl
                  label="Valence"
                  value={simulationMetrics.valence ?? 0}
                  min={-1}
                  max={1}
                  step={0.01}
                  formatter={formatSigned}
                  disabled={!isSimulationEnabled}
                  onChange={(value) => setDebugSimulationMetric("valence", value)}
                />
                <SliderControl
                  label="Arousal"
                  value={simulationMetrics.arousal ?? 0}
                  min={-1}
                  max={1}
                  step={0.01}
                  formatter={formatSigned}
                  disabled={!isSimulationEnabled}
                  onChange={(value) => setDebugSimulationMetric("arousal", value)}
                />
                <SliderControl
                  label="Top emotion probability"
                  value={simulationMetrics.emotionConfidence ?? 0}
                  min={0}
                  max={1}
                  step={0.01}
                  formatter={formatConfidence}
                  disabled={!isSimulationEnabled}
                  onChange={(value) => setDebugSimulationMetric("emotionConfidence", value)}
                />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Emotion</span>
                    <select
                      value={simulationMetrics.emotion || ""}
                      disabled={!isSimulationEnabled}
                      onChange={(event) => setDebugSimulationMetric("emotion", event.target.value || null)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40"
                    >
                      <option value="">None</option>
                      {EMOTION_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Face state</span>
                    <select
                      value={simulationMetrics.faceDetected ? "face" : "no-face"}
                      disabled={!isSimulationEnabled}
                      onChange={(event) => setDebugSimulationMetric("faceDetected", event.target.value === "face")}
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40"
                    >
                      <option value="face">Face</option>
                      <option value="no-face">No face</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Data quality</span>
                    <select
                      value={simulationMetrics.dataQuality}
                      disabled={!isSimulationEnabled}
                      onChange={(event) => setDebugSimulationMetric("dataQuality", event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40"
                    >
                      <option value={DATA_QUALITY.GOOD}>Good</option>
                      <option value={DATA_QUALITY.PARTIAL}>Partial</option>
                      <option value={DATA_QUALITY.INSUFFICIENT}>Insufficient</option>
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={resetDebugSimulation}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-800"
                >
                  Reset Simulation
                </button>
              </Section>

              <Section title="Session Status And Event Log">
                <div className="grid grid-cols-1 gap-2">
                  <KeyValue label="Session ID" value={activeSession?.id ? `${activeSession.id.slice(0, 8)}...` : "none"} />
                  <KeyValue label="Status" status={sessionStatus} />
                  <KeyValue label="Elapsed active time" value={formatElapsed(elapsedMs)} />
                  <KeyValue label="Durable accumulated time" value={formatElapsed(durableElapsedMs)} />
                  <KeyValue label="Recovery pending" value={activeSession?.recoveryPending ? "yes" : "no"} />
                  <KeyValue label="Last checkpoint" value={formatTimestamp(activeSession?.lastCheckpointAt || checkpointStatus.lastCommittedAt)} />
                  <KeyValue label="Checkpoint write" status={checkpointStatus.state} />
                  <KeyValue label="Latest sample" value={formatTimestamp(latestSampleTime)} />
                  <KeyValue label="Formal sample count" value={activeSessionSamples.length} />
                  <KeyValue label="Camera / Monitoring" value={`${isCameraAllowed ? "camera on" : "camera off"} / ${isMonitoring ? "monitoring on" : "monitoring off"}`} />
                  <KeyValue label="Telemetry frames" value={`${telemetryTable.length} table / ${rawLandmarksHistory.length} raw frames`} />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Memory-only event log</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyLog()}
                        className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300 transition-all hover:bg-slate-800"
                      >
                        Copy Sanitized Log
                      </button>
                      <button
                        type="button"
                        onClick={clearEventLog}
                        className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300 transition-all hover:bg-slate-800"
                      >
                        Clear Log
                      </button>
                    </div>
                  </div>
                  {copyStatus && <p className="mt-2 text-[10px] text-cyan-300">{copyStatus}</p>}
                  <div className="mt-3 max-h-48 overflow-y-auto font-mono text-[10px]">
                    {eventLog.length === 0 ? (
                      <p className="text-slate-600">No events logged yet.</p>
                    ) : (
                      eventLog.map((entry) => (
                        <div key={entry.id} className="border-b border-white/5 py-1 last:border-b-0">
                          <span className="text-slate-600">[{entry.time}]</span>{" "}
                          <span className={entry.type === "error" ? "text-red-300" : entry.type === "warning" ? "text-amber-300" : entry.type === "success" ? "text-emerald-300" : entry.type === "debug" ? "text-cyan-300" : "text-slate-300"}>
                            {entry.message}
                          </span>
                          {entry.count > 1 && <span className="text-slate-500"> x{entry.count}</span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <details
                  open={isAdvancedControlsOpen}
                  onToggle={(event) => setIsAdvancedControlsOpen(event.currentTarget.open)}
                  className="rounded-xl border border-white/10 bg-slate-900/45 p-3"
                >
                  <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-300">
                    Advanced Controls
                  </summary>
                  <div className="mt-3 space-y-3">
                    <label className="block rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">Live inference FPS</span>
                      <p className="mt-1 text-[10px] leading-relaxed text-amber-100/80">
                        Changes the live inference pipeline and may affect formal data quality.
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="15"
                          value={inferenceFps}
                          onChange={(event) => {
                            setInferenceFps(parseInt(event.target.value, 10));
                            addLog(`Frame sampler rate adjusted to ${event.target.value} FPS.`, "debug");
                          }}
                          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-400"
                        />
                        <span className="font-mono text-xs font-bold text-white">{inferenceFps}</span>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        clearAllDebugMetricOverrides();
                        addLog("Display overrides cleared.", "debug");
                      }}
                      className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-[10px] font-bold text-slate-300 transition-all hover:bg-slate-800"
                    >
                      Clear Display Overrides
                    </button>
                  </div>
                </details>

                <details
                  open={isSensitiveSectionOpen}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setIsSensitiveSectionOpen(open);
                    if (!open) setSensitiveDebugPreviewEnabled(false);
                  }}
                  className="rounded-xl border border-red-400/15 bg-red-400/[0.04] p-3"
                >
                  <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-red-200">
                    Advanced / Sensitive Data
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-[10px] leading-relaxed text-red-100/80">
                      Face crops and raw landmark CSV exports are temporary memory-only developer tools. They are not saved to IndexedDB or copied into the event log.
                    </p>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950 px-3 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Show face-crop preview</span>
                      <input
                        type="checkbox"
                        checked={isSensitiveDebugPreviewEnabled}
                        onChange={(event) => setSensitiveDebugPreviewEnabled(event.target.checked)}
                        className="h-4 w-4 accent-red-300"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleExportLandmarks}
                      className="w-full rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-[10px] font-bold text-red-100 transition-all hover:bg-red-400/20"
                    >
                      Export Raw Landmark CSV
                    </button>
                  </div>
                </details>

                {resolvedDebugMetrics.attention.overrideActive || resolvedDebugMetrics.fatigue.overrideActive ? (
                  <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-[10px] leading-relaxed text-amber-100">
                    Display overrides are active for status-message testing only. Formal session samples continue to use inferred metric refs.
                  </p>
                ) : null}
              </Section>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
