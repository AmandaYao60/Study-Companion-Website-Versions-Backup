"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BREAK_DECISION_ALARM_REPLAY_MS,
  BREAK_DECISION_WAIT_MS,
  BREAK_EXTENSION_MS,
  BREAK_STATUS,
  MAX_BREAK_EXTENSION_COUNT,
  PRE_BREAK_WARNING_MS,
  createIndexedDbSessionRepository,
  createSessionRuntime,
  SESSION_STATUS,
  calculatePlannedBreakPositions,
  cancelBreak,
  completeBreak,
  markBreakDecisionAlarmReplayed,
  markBreakDecisionStarted,
  markBreakReady,
  markBreakWarningShown,
  normalizeBreakEvents,
  normalizeSessionPlan,
  skipBreak,
  startBreakExtension,
  startPlannedBreak,
  validateSessionRepositoryContract,
} from "../services/session/index.js";
import {
  applyDebugSimulationPreset,
  createDefaultDebugSimulationState,
  selectDebugDisplayMetrics,
  updateDebugSimulationMetric,
} from "../services/debug/debugSimulation.js";
import {
  appendDebugLogMessage,
} from "../services/debug/debugEventLog.js";
import {
  DIAGNOSTIC_SNAPSHOT_INTERVAL_MS,
  createDefaultDiagnosticSnapshot,
  createEstimatorDiagnosticSnapshot,
  mergeAffectDiagnostic,
} from "../services/debug/debugDiagnostics.js";

const SessionContext = createContext(null);
const MonitoringContext = createContext(null);
const DebugContext = createContext(null);
const EYE_LANDMARKS = {
  left: [33, 160, 158, 133, 153, 144],
  right: [362, 385, 387, 263, 373, 380],
};

const EYE_CLOSED_THRESHOLD = 0.35;
const EYE_CALIBRATION_WINDOW_MS = 8000;
const MIN_EYE_CALIBRATION_SAMPLES = 12;
const MIN_OPEN_EAR_SAMPLE = 0.12;
const OBSERVATION_WINDOW_MS = 60000;
const ATTENTION_WINDOW_MS = 10000;
const FATIGUE_WINDOW_MS = 30000;
const ESTIMATOR_INTERVAL_MS = 1000;
const SESSION_CHECKPOINT_INTERVAL_MS = 5000;
const LONG_CLOSURE_MS = 1200;
const BLINK_MIN_MS = 80;
const BLINK_MAX_MS = 450;
const BLINK_BASELINE_MIN_MS = 30000;
const SESSION_START_BASELINE = { attention: 80, fatigue: 10 };
const AUDIO_ASSETS = Object.freeze({
  study: "/music/studytime-music.mp3",
  break: "/music/breaktime-music.mp3",
  shortAlarm: "/music/short-alarm.mp3",
  longAlarm: "/music/long-alarm.mp3",
});
const BREAK_PHASE = Object.freeze({
  IDLE: "idle",
  WARNING: "pre-break-warning",
  READY: "break-ready",
  SKIP_CONFIRMATION: "skip-confirmation",
  ACTIVE: "active-break",
  END_EARLY_CONFIRMATION: "end-early-confirmation",
  COMPLETE_DECISION: "break-complete-awaiting-decision",
  PAUSED_FALLBACK: "paused-session",
});
const createIdleBreakState = () => ({
  phase: BREAK_PHASE.IDLE,
  breakId: null,
  plannedStartElapsedMs: null,
  baseDurationMs: 0,
  extensionCount: 0,
  activeSegmentStartedAt: null,
  activeSegmentDurationMs: 0,
  decisionStartedAt: null,
  remainingMs: 0,
  decisionElapsedMs: 0,
  audioBlocked: false,
});
const isBreakModePhase = (phase) => (
  phase === BREAK_PHASE.ACTIVE ||
  phase === BREAK_PHASE.END_EARLY_CONFIRMATION ||
  phase === BREAK_PHASE.COMPLETE_DECISION
);
const isBreakBlockingPhase = (phase) => (
  phase === BREAK_PHASE.READY ||
  phase === BREAK_PHASE.SKIP_CONFIRMATION ||
  phase === BREAK_PHASE.ACTIVE ||
  phase === BREAK_PHASE.END_EARLY_CONFIRMATION ||
  phase === BREAK_PHASE.COMPLETE_DECISION
);
const findBreakEvent = (session, breakId) => (
  normalizeBreakEvents(session?.breakEvents || []).find((event) => event.id === breakId) || null
);
const getNextScheduledBreakEvent = (session) => (
  normalizeBreakEvents(session?.breakEvents || [])
    .filter((event) => event.status === BREAK_STATUS.SCHEDULED)
    .sort((a, b) => (a.plannedStartElapsedMs ?? Infinity) - (b.plannedStartElapsedMs ?? Infinity))[0] || null
);
const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const createDefaultDebugMetricOverrides = () => ({
  attention: { active: false, value: null },
  fatigue: { active: false, value: null },
});

const calculateDistance = (a, b, videoWidth, videoHeight) => {
  if (!a || !b || videoWidth <= 0 || videoHeight <= 0) return null;
  const dx = (a.x - b.x) * videoWidth;
  const dy = (a.y - b.y) * videoHeight;
  const distance = Math.hypot(dx, dy);
  return Number.isFinite(distance) ? distance : null;
};

const calculateEyeAspectRatio = (landmarks, indices, videoWidth, videoHeight) => {
  if (!Array.isArray(landmarks) || !Array.isArray(indices) || indices.length < 6) {
    return null;
  }

  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => landmarks[index]);
  if (![p1, p2, p3, p4, p5, p6].every(Boolean)) return null;

  const verticalOne = calculateDistance(p2, p6, videoWidth, videoHeight);
  const verticalTwo = calculateDistance(p3, p5, videoWidth, videoHeight);
  const horizontal = calculateDistance(p1, p4, videoWidth, videoHeight);

  if (!verticalOne || !verticalTwo || !horizontal) return null;

  const ear = (verticalOne + verticalTwo) / (2 * horizontal);
  return Number.isFinite(ear) ? ear : null;
};

const calculateMean = (values) => {
  const validValues = values.filter(Number.isFinite);
  if (validValues.length === 0) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
};

const calculateMedian = (values) => {
  const validValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (validValues.length === 0) return null;
  const middle = Math.floor(validValues.length / 2);
  return validValues.length % 2 === 0
    ? (validValues[middle - 1] + validValues[middle]) / 2
    : validValues[middle];
};

const calculateStandardDeviation = (values) => {
  const validValues = values.filter(Number.isFinite);
  if (validValues.length < 2) return 0;
  const mean = calculateMean(validValues);
  if (!Number.isFinite(mean)) return 0;
  const variance = calculateMean(validValues.map((value) => (value - mean) ** 2));
  return Number.isFinite(variance) ? Math.sqrt(variance) : 0;
};

const getRecentObservations = (observations, timestamp, windowMs) =>
  observations.filter((observation) => timestamp - observation.timestamp <= windowMs);

const roundForDebug = (value, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within an AppProvider");
  }
  return context;
};

export const useMonitoring = () => {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error("useMonitoring must be used within an AppProvider");
  }
  return context;
};

export const useDebug = () => {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error("useDebug must be used within an AppProvider");
  }
  return context;
};

function TimedBreakDialog({ state, actions }) {
  const primaryRef = useRef(null);
  const phase = state.phase;
  const isOpen = [
    BREAK_PHASE.READY,
    BREAK_PHASE.SKIP_CONFIRMATION,
    BREAK_PHASE.END_EARLY_CONFIRMATION,
    BREAK_PHASE.COMPLETE_DECISION,
  ].includes(phase);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement;
    const timeout = window.setTimeout(() => primaryRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (phase === BREAK_PHASE.SKIP_CONFIRMATION) actions.cancelSkipBreak();
      if (phase === BREAK_PHASE.END_EARLY_CONFIRMATION) actions.cancelEndBreakEarly();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
  }, [actions, isOpen, phase]);

  if (!isOpen) return null;

  let title = "This is your break time!";
  let body = "Step away for a moment and let your focus reset.";
  let controls = (
    <>
      <button ref={primaryRef} type="button" onClick={actions.startReadyBreak} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
        Start Your Break Now
      </button>
      <button type="button" onClick={actions.requestSkipBreak} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
        Skip This Break
      </button>
    </>
  );

  if (phase === BREAK_PHASE.SKIP_CONFIRMATION) {
    title = "Skip this planned break?";
    body = "Regular breaks can help protect your focus and reduce fatigue. Are you sure you want to skip this break?";
    controls = (
      <>
        <button ref={primaryRef} type="button" onClick={actions.cancelSkipBreak} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
          Cancel
        </button>
        <button type="button" onClick={actions.confirmSkipBreak} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
          Confirm
        </button>
      </>
    );
  } else if (phase === BREAK_PHASE.END_EARLY_CONFIRMATION) {
    title = "End your break early?";
    body = "Taking the full break can help you return with better focus. Do you still want to end your break early?";
    controls = (
      <>
        <button ref={primaryRef} type="button" onClick={actions.cancelEndBreakEarly} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
          Cancel
        </button>
        <button type="button" onClick={actions.confirmEndBreakEarly} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
          Confirm
        </button>
      </>
    );
  } else if (phase === BREAK_PHASE.COMPLETE_DECISION) {
    title = "Break complete";
    body = "You can return to your study session now, or take one short extension.";
    controls = (
      <>
        <button ref={primaryRef} type="button" onClick={actions.continueStudyAfterBreak} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
          Continue Study
        </button>
        {state.extensionCount < MAX_BREAK_EXTENSION_COUNT && (
          <button type="button" onClick={() => actions.extendBreak("manual")} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
            Extend Break by 3 Minutes
          </button>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="timed-break-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Planned Break</p>
        <h2 id="timed-break-title" className="mt-3 text-2xl font-black">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{body}</p>
        {phase === BREAK_PHASE.COMPLETE_DECISION && (
          <p className="mt-3 text-xs text-slate-500" aria-live="polite">
            Automatic extension in {formatCountdown(Math.max(0, BREAK_DECISION_WAIT_MS - state.decisionElapsedMs))}.
          </p>
        )}
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">{controls}</div>
      </section>
    </div>
  );
}

function TimedBreakWarning({ state }) {
  if (state.phase !== BREAK_PHASE.WARNING) return null;
  return (
    <div className="fixed inset-x-4 top-20 z-[850] mx-auto max-w-md rounded-2xl border border-cyan-300/25 bg-slate-950/92 p-4 text-white shadow-2xl backdrop-blur-xl" role="status" aria-live="polite">
      <p className="text-sm font-black text-cyan-200">Break in {formatCountdown(state.remainingMs)}</p>
      <p className="mt-1 text-xs text-slate-300">You&apos;re almost there. Keep going for a little longer.</p>
    </div>
  );
}

export const AppProvider = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();
  // Global Mode States
  const [isDebugMode, setIsDebugModeState] = useState(false);
  
  // Monitoring & Camera States
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraAllowed, setIsCameraAllowed] = useState(false);
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraStatus, setCameraStatus] = useState("off");
  const [sessionClock, setSessionClock] = useState({
    accumulatedMs: 0,
    runningSince: null,
    isRunning: false,
  });

  // AI Web-SDK loading states
  const [isAiLoaded, setIsAiLoaded] = useState(false);
  const [aiLoadingProgress, setAiLoadingProgress] = useState(0);
  const [aiError, setAiError] = useState(null);
  const [inferenceFps, setInferenceFps] = useState(5);
  const [faceLandmarkerStatus, setFaceLandmarkerStatus] = useState("idle");
  const [gestureRecognizerStatus, setGestureRecognizerStatus] = useState("idle");
  
  // Real-time table logging data
  const [telemetryTable, setTelemetryTable] = useState([]);
  const [rawLandmarksHistory, setRawLandmarksHistory] = useState([]);
  const [eyeOpenness, setEyeOpenness] = useState(1.0);

  const faceLandmarkerRef = useRef(null);
  const gestureRecognizerRef = useRef(null);
  const previousGestureRef = useRef("None");
  const isAiInitializingRef = useRef(false);
  const monitoringDetectionsRef = useRef({ face: null, gesture: null });
  const runtimeFaceCropCanvasRef = useRef(null);
  const [hasDetectedFace, setHasDetectedFace] = useState(false);
  const [hasDetectedHand, setHasDetectedHand] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState("idle");

  // Keep track of blink detection state
  const eyesClosedStartRef = useRef(null);
  const wasEyesClosedRef = useRef(false);
  const blinkTimestampsRef = useRef([]); // for rolling blink rate
  const blinkEventsRef = useRef([]);
  const longClosureRecordedRef = useRef(false);
  const longClosureTimestampsRef = useRef([]);
  const bothHandsFrameCountRef = useRef(0);

  // Rolling attention/fatigue estimator state
  const observationsRef = useRef([]);
  const eyeCalibrationSamplesRef = useRef([]);
  const baselineOpenEARRef = useRef(null);
  const baselineBlinkRateRef = useRef(null);
  const monitoringSessionStartedAtRef = useRef(null);
  const lastEstimatorUpdateRef = useRef(0);
  const lastDebugLogRef = useRef(0);
  const lastDiagnosticSnapshotAtRef = useRef(0);
  const processingFrameTimestampsRef = useRef([]);
  const attentionEstimateRef = useRef(85);
  const fatigueEstimateRef = useRef(15);
  const latestAttentionRef = useRef(85);
  const latestFatigueRef = useRef(15);
  const debugModeRef = useRef(false);
  const sensitiveDebugPreviewRef = useRef(false);

  // Affect smoothing state
  const smoothedValenceRef = useRef(null);
  const smoothedArousalRef = useRef(null);

  // Inferred behavioral states (0 - 100)
  const [attention, setAttention] = useState(85);
  const [fatigue, setFatigue] = useState(15);
  const [debugMetricOverrides, setDebugMetricOverrides] = useState(createDefaultDebugMetricOverrides);
  const [debugSimulation, setDebugSimulation] = useState(createDefaultDebugSimulationState);
  const [debugDiagnosticSnapshot, setDebugDiagnosticSnapshot] = useState(createDefaultDiagnosticSnapshot);
  const [isSensitiveDebugPreviewEnabled, setIsSensitiveDebugPreviewEnabledState] = useState(false);

  // Local affect model state
  const [affectState, setAffectState] = useState({
    valence: null,
    arousal: null,
    emotion: null,
    confidence: null,
    valid: false,
    source: null,
    updatedAt: null,
    latencyMs: null,
  });
  const [affectModelStatus, setAffectModelStatus] = useState("idle");

  // CV Telemetry (Debug Info)
  const [blinkRate, setBlinkRate] = useState(12); // blinks per minute
  const [yawnCount, setYawnCount] = useState(0);
  const [headPose, setHeadPose] = useState({ yaw: 2.1, pitch: -1.5, roll: 0.5 });
  const [currentGesture, setCurrentGesture] = useState("None");
  const [fps, setFps] = useState(30);
  const [latency, setLatency] = useState(18); // inference latency in ms

  // Event Log (for Debug Mode Console)
  const [eventLog, setEventLog] = useState([]);

  const [sessionRuntimeBundle] = useState(() => {
    const repository = createIndexedDbSessionRepository();
    const contract = validateSessionRepositoryContract(repository);
    if (!contract.valid) {
      throw new Error(`IndexedDB session repository is missing methods: ${contract.missing.join(", ")}`);
    }
    return {
      runtime: createSessionRuntime({ repository }),
      repositoryKind: "IndexedDB",
    };
  });
  const sessionRuntime = sessionRuntimeBundle.runtime;
  const sessionRepositoryKind = sessionRuntimeBundle.repositoryKind;
  const sessionRuntimeRef = useRef(sessionRuntime);
  const hasHydratedCompletedSessionsRef = useRef(false);
  const lastCheckpointFailureRef = useRef(null);
  const resumeTransitionPromiseRef = useRef(null);
  const [checkpointStatus, setCheckpointStatus] = useState({
    state: "idle",
    lastAttemptedAt: null,
    lastCommittedAt: null,
    reason: null,
    error: null,
  });

  const [activeSession, setActiveSession] = useState(null);
  const [completedSessions, setCompletedSessions] = useState([]);
  const [activeSessionSamples, setActiveSessionSamples] = useState([]);
  const [recoveryPromptDismissedSessionId, setRecoveryPromptDismissedSessionId] = useState(null);
  const [timedBreakState, setTimedBreakState] = useState(createIdleBreakState);
  const [isFocusSpaceActive, setIsFocusSpaceActive] = useState(false);
  const [sessionAudioState, setSessionAudioState] = useState({
    volume: 0.55,
    muted: false,
    blocked: false,
  });

  const streamRef = useRef(null);
  const sessionClockRef = useRef(sessionClock);
  const activeSessionRef = useRef(activeSession);
  const timedBreakStateRef = useRef(timedBreakState);
  const isFocusSpaceActiveRef = useRef(isFocusSpaceActive);
  const sessionAudioStateRef = useRef(sessionAudioState);
  const audioElementsRef = useRef({});
  const breakActionPromiseRef = useRef(null);
  const affectStateRef = useRef(affectState);
  const monitoringRef = useRef(isMonitoring);
  const cameraAllowedRef = useRef(isCameraAllowed);
  const aiLoadedRef = useRef(isAiLoaded);

  useEffect(() => {
    sessionClockRef.current = sessionClock;
  }, [sessionClock]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    timedBreakStateRef.current = timedBreakState;
  }, [timedBreakState]);

  useEffect(() => {
    isFocusSpaceActiveRef.current = isFocusSpaceActive;
  }, [isFocusSpaceActive]);

  useEffect(() => {
    sessionAudioStateRef.current = sessionAudioState;
  }, [sessionAudioState]);

  useEffect(() => {
    affectStateRef.current = affectState;
  }, [affectState]);

  useEffect(() => {
    monitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    cameraAllowedRef.current = isCameraAllowed;
  }, [isCameraAllowed]);

  useEffect(() => {
    aiLoadedRef.current = isAiLoaded;
  }, [isAiLoaded]);

  useEffect(() => {
    sensitiveDebugPreviewRef.current = isSensitiveDebugPreviewEnabled;
  }, [isSensitiveDebugPreviewEnabled]);

  const getSessionElapsedMs = useCallback(() => {
    const clock = sessionClockRef.current;
    if (!clock.isRunning || !clock.runningSince) {
      return clock.accumulatedMs;
    }

    return clock.accumulatedMs + Date.now() - clock.runningSince;
  }, []);

  const startSessionClock = useCallback(() => {
    setSessionClock((previous) => {
      if (previous.isRunning) return previous;
      return {
        accumulatedMs: previous.accumulatedMs,
        runningSince: Date.now(),
        isRunning: true,
      };
    });
  }, []);

  const startSessionClockFromZero = useCallback(() => {
    setSessionClock({
      accumulatedMs: 0,
      runningSince: Date.now(),
      isRunning: true,
    });
  }, []);

  const startSessionClockFromElapsed = useCallback((elapsedMs = 0) => {
    setSessionClock({
      accumulatedMs: Math.max(0, elapsedMs),
      runningSince: Date.now(),
      isRunning: true,
    });
  }, []);

  const freezeSessionClock = useCallback(() => {
    const elapsedMs = getSessionElapsedMs();
    setSessionClock({
      accumulatedMs: elapsedMs,
      runningSince: null,
      isRunning: false,
    });
    return elapsedMs;
  }, [getSessionElapsedMs]);

  const resetSessionClock = useCallback(() => {
    setSessionClock({
      accumulatedMs: 0,
      runningSince: null,
      isRunning: false,
    });
  }, []);
  // Cleanup camera stream and MediaPipe models when AppProvider unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => track.stop());

        streamRef.current = null;
      }

      faceLandmarkerRef.current?.close?.();
      gestureRecognizerRef.current?.close?.();

      faceLandmarkerRef.current = null;
      gestureRecognizerRef.current = null;
      Object.values(audioElementsRef.current).forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
      audioElementsRef.current = {};
    };
  }, []);

  // Helper to add log messages
  const addLog = useCallback((message, type = "info") => {
    setEventLog((previous) => appendDebugLogMessage(previous, message, type));
  }, []);

  const clearEventLog = useCallback(() => {
    setEventLog([]);
  }, []);

  const getAudioElement = useCallback((key) => {
    if (typeof Audio === "undefined") return null;
    const existing = audioElementsRef.current[key];
    if (existing) return existing;
    const audio = new Audio(AUDIO_ASSETS[key]);
    audio.preload = "auto";
    audio.volume = sessionAudioStateRef.current.muted ? 0 : sessionAudioStateRef.current.volume;
    audioElementsRef.current[key] = audio;
    return audio;
  }, []);

  const stopAudio = useCallback((key) => {
    const audio = audioElementsRef.current[key];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const stopAllSessionAudio = useCallback(() => {
    Object.keys(audioElementsRef.current).forEach((key) => stopAudio(key));
  }, [stopAudio]);

  const playSessionAudio = useCallback((key, { loop = false, restart = true } = {}) => {
    const audioState = sessionAudioStateRef.current;
    const audio = getAudioElement(key);
    if (!audio) return;
    audio.loop = loop;
    audio.volume = audioState.muted ? 0 : audioState.volume;
    if (audioState.muted) return;
    if (restart) audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        if (error?.name === "AbortError") return;
        setSessionAudioState((previous) => ({ ...previous, blocked: true }));
      });
    }
  }, [getAudioElement]);

  const setSessionAudioVolume = useCallback((volume) => {
    const nextVolume = clamp(Number(volume), 0, 1);
    setSessionAudioState((previous) => ({ ...previous, volume: nextVolume, blocked: false }));
    Object.values(audioElementsRef.current).forEach((audio) => {
      audio.volume = sessionAudioStateRef.current.muted ? 0 : nextVolume;
    });
  }, []);

  const setSessionAudioMuted = useCallback((muted) => {
    const nextMuted = Boolean(muted);
    setSessionAudioState((previous) => ({ ...previous, muted: nextMuted, blocked: false }));
    Object.values(audioElementsRef.current).forEach((audio) => {
      audio.volume = nextMuted ? 0 : sessionAudioStateRef.current.volume;
    });
    if (nextMuted) stopAllSessionAudio();
  }, [stopAllSessionAudio]);

  const enableSessionAudio = useCallback(() => {
    setSessionAudioState((previous) => ({ ...previous, muted: false, blocked: false }));
    const state = timedBreakStateRef.current;
    if (state.phase === BREAK_PHASE.ACTIVE) {
      playSessionAudio("break", { loop: true, restart: false });
    } else if (isFocusSpaceActiveRef.current && activeSessionRef.current?.status === SESSION_STATUS.ACTIVE && sessionClockRef.current.isRunning) {
      playSessionAudio("study", { loop: true, restart: false });
    }
  }, [playSessionAudio]);

  const setDebugMetricOverride = useCallback((metric, value) => {
    if (!isDebugMode || !["attention", "fatigue"].includes(metric)) return;
    const nextValue = Math.round(clamp(Number(value), 0, 100));
    setDebugMetricOverrides((previous) => ({
      ...previous,
      [metric]: { active: true, value: nextValue },
    }));
  }, [isDebugMode]);

  const clearDebugMetricOverride = useCallback((metric) => {
    if (!["attention", "fatigue"].includes(metric)) return;
    setDebugMetricOverrides((previous) => ({
      ...previous,
      [metric]: { active: false, value: null },
    }));
  }, []);

  const clearAllDebugMetricOverrides = useCallback(() => {
    setDebugMetricOverrides(createDefaultDebugMetricOverrides());
  }, []);

  const setDebugSimulationEnabled = useCallback((enabled) => {
    if (!debugModeRef.current && enabled) return;
    setDebugSimulation((previous) => ({
      ...previous,
      enabled: Boolean(enabled),
    }));
  }, []);

  const setDebugSimulationMetric = useCallback((metric, value) => {
    if (!debugModeRef.current) return;
    setDebugSimulation((previous) => updateDebugSimulationMetric(previous, metric, value));
  }, []);

  const applyDebugSimulationPresetById = useCallback((presetId) => {
    if (!debugModeRef.current) return;
    setDebugSimulation((previous) => applyDebugSimulationPreset(previous, presetId));
  }, []);

  const resetDebugSimulation = useCallback(() => {
    setDebugSimulation(createDefaultDebugSimulationState());
  }, []);

  const setSensitiveDebugPreviewEnabled = useCallback((enabled) => {
    if (!debugModeRef.current && enabled) return;
    const resolvedValue = Boolean(enabled);
    sensitiveDebugPreviewRef.current = resolvedValue;
    setIsSensitiveDebugPreviewEnabledState(resolvedValue);
    if (!resolvedValue) {
      setRawLandmarksHistory([]);
    }
  }, []);

  const setIsDebugMode = useCallback((nextValue) => {
    const resolvedValue = Boolean(
      typeof nextValue === "function" ? nextValue(debugModeRef.current) : nextValue
    );
    if (!resolvedValue) {
      setDebugMetricOverrides(createDefaultDebugMetricOverrides());
      setDebugSimulation(createDefaultDebugSimulationState());
      setTelemetryTable([]);
      setRawLandmarksHistory([]);
      sensitiveDebugPreviewRef.current = false;
      setIsSensitiveDebugPreviewEnabledState(false);
    }
    debugModeRef.current = resolvedValue;
    setIsDebugModeState(resolvedValue);
  }, []);

  const syncSessionState = useCallback(() => {
    const snapshot = sessionRuntimeRef.current.getSnapshot();
    activeSessionRef.current = snapshot.activeSession;
    setActiveSession(snapshot.activeSession);
    setActiveSessionSamples(snapshot.activeSessionSamples);
    setCompletedSessions(snapshot.completedSessions);
  }, []);

  const runResumeTransition = useCallback((operation) => {
    if (resumeTransitionPromiseRef.current) return resumeTransitionPromiseRef.current;

    const promise = operation().finally(() => {
      resumeTransitionPromiseRef.current = null;
    });
    resumeTransitionPromiseRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    if (hasHydratedCompletedSessionsRef.current) return undefined;
    let isMounted = true;

    sessionRuntimeRef.current.initializeSessionState({ recoverInterrupted: true })
      .then((result) => {
        if (!isMounted) return;
        hasHydratedCompletedSessionsRef.current = true;
        const recovered = result?.recoveredSession;
        if (recovered) {
          const recoveredElapsedMs = Number.isFinite(recovered.accumulatedStudyMs)
            ? Math.max(0, recovered.accumulatedStudyMs)
            : 0;
          setSessionClock({
            accumulatedMs: recoveredElapsedMs,
            runningSince: null,
            isRunning: false,
          });
          sessionClockRef.current = {
            accumulatedMs: recoveredElapsedMs,
            runningSince: null,
            isRunning: false,
          };
          setIsMonitoring(false);
          monitoringRef.current = false;
          setIsCameraAllowed(false);
          cameraAllowedRef.current = false;
          setRecoveryPromptDismissedSessionId(null);
          addLog("Interrupted study session recovered from local checkpoint.", "warning");
        }
        if (result?.invalidRecoverableSessions?.length > 0) {
          addLog("Some unfinished local sessions could not be recovered.", "error");
        }
        syncSessionState();
      })
      .catch((error) => {
        if (!isMounted) return;
        hasHydratedCompletedSessionsRef.current = true;
        const message = error instanceof Error ? error.message : String(error);
        console.error("Session storage initialization failed:", error);
        addLog(`Local session state could not be loaded: ${message}`, "error");
      });

    return () => {
      isMounted = false;
    };
  }, [addLog, syncSessionState]);

  useEffect(() => {
    latestAttentionRef.current = attention;
  }, [attention]);

  useEffect(() => {
    debugModeRef.current = isDebugMode;
  }, [isDebugMode]);

  useEffect(() => {
    latestFatigueRef.current = fatigue;
  }, [fatigue]);

  const resetEstimatorSession = useCallback((attentionValue = 80, fatigueValue = 10) => {
    observationsRef.current = [];
    eyeCalibrationSamplesRef.current = [];
    baselineOpenEARRef.current = null;
    baselineBlinkRateRef.current = null;
    monitoringSessionStartedAtRef.current = null;
    lastEstimatorUpdateRef.current = 0;
    lastDebugLogRef.current = 0;
    lastDiagnosticSnapshotAtRef.current = 0;
    processingFrameTimestampsRef.current = [];
    attentionEstimateRef.current = clamp(attentionValue, 0, 100);
    fatigueEstimateRef.current = clamp(fatigueValue, 0, 100);
    blinkTimestampsRef.current = [];
    blinkEventsRef.current = [];
    longClosureTimestampsRef.current = [];
    eyesClosedStartRef.current = null;
    wasEyesClosedRef.current = false;
    longClosureRecordedRef.current = false;
    bothHandsFrameCountRef.current = 0;
  }, []);

  useEffect(() => {
    if (!isMonitoring) return;
    resetEstimatorSession(latestAttentionRef.current, latestFatigueRef.current);
  }, [isMonitoring, resetEstimatorSession]);

  const resolvedDebugMetrics = useMemo(() => {
    const attentionOverrideActive = isDebugMode && debugMetricOverrides.attention.active;
    const fatigueOverrideActive = isDebugMode && debugMetricOverrides.fatigue.active;

    return {
      attention: {
        displayedValue: attentionOverrideActive ? debugMetricOverrides.attention.value : attention,
        inferredValue: attention,
        source: attentionOverrideActive ? "override" : "heuristic",
        overrideActive: attentionOverrideActive,
      },
      fatigue: {
        displayedValue: fatigueOverrideActive ? debugMetricOverrides.fatigue.value : fatigue,
        inferredValue: fatigue,
        source: fatigueOverrideActive ? "override" : "heuristic",
        overrideActive: fatigueOverrideActive,
      },
    };
  }, [attention, debugMetricOverrides, fatigue, isDebugMode]);

  const debugLiveMetrics = useMemo(() => {
    const latestSample = activeSessionSamples[activeSessionSamples.length - 1] || null;
    const hasEstimatorSnapshot = Boolean(debugDiagnosticSnapshot.updatedAt);

    return {
      attention: hasEstimatorSnapshot ? debugDiagnosticSnapshot.attention.value : null,
      fatigue: hasEstimatorSnapshot ? debugDiagnosticSnapshot.fatigue.value : null,
      valence: affectState.valid ? affectState.valence : null,
      arousal: affectState.valid ? affectState.arousal : null,
      emotion: affectState.valid ? affectState.emotion : null,
      emotionConfidence: affectState.valid ? affectState.confidence : null,
      faceDetected: hasDetectedFace,
      handDetected: hasDetectedHand,
      dataQuality: latestSample?.dataQuality || debugDiagnosticSnapshot.aggregation?.dataQuality || "insufficient",
      latestObservationAt: hasEstimatorSnapshot ? debugDiagnosticSnapshot.updatedAt : null,
      latestSampleAt: latestSample?.intervalEndedAt || latestSample?.recordedAt || null,
    };
  }, [activeSessionSamples, affectState, debugDiagnosticSnapshot, hasDetectedFace, hasDetectedHand]);

  const debugDisplayMetrics = useMemo(() => (
    selectDebugDisplayMetrics(debugLiveMetrics, isDebugMode ? debugSimulation : null)
  ), [debugLiveMetrics, debugSimulation, isDebugMode]);

  // AI Web-SDK loaders and updates
  const loadAiModels = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isAiLoaded || isAiInitializingRef.current) return;
    isAiInitializingRef.current = true;
    setAiError(null);
    setAiLoadingProgress(10);
    setFaceLandmarkerStatus("loading");
    setGestureRecognizerStatus("loading");
    addLog("Loading AI Models resolver...", "info");
    
    try {
      const { FilesetResolver, FaceLandmarker, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      
      setAiLoadingProgress(30);
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );
      
      setAiLoadingProgress(50);
      addLog("Initializing Face Landmarker...", "info");
      setFaceLandmarkerStatus("loading");
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO"
      });
      setFaceLandmarkerStatus("ready");
      
      setAiLoadingProgress(80);
      addLog("Initializing Gesture Recognizer...", "info");
      setGestureRecognizerStatus("loading");
      gestureRecognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
      setGestureRecognizerStatus("ready");
      
      setAiLoadingProgress(100);
      setIsAiLoaded(true);
      addLog("AI Web-SDK models loaded successfully.", "success");
    } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("AI Model Loading Error:", err);
    setAiError(errorMessage);
    setAiLoadingProgress(0);
    if (!faceLandmarkerRef.current) setFaceLandmarkerStatus("error");
    if (!gestureRecognizerRef.current) setGestureRecognizerStatus("error");
    addLog(`Failed to load AI models: ${errorMessage}`, "error");
    } finally {
      isAiInitializingRef.current = false;
    }
  }, [isAiLoaded, addLog]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAiModels();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAiModels]);

  const updateAffectMetrics = useCallback((result) => {
    if (
      !result ||
      result.valid === false ||
      !Number.isFinite(result.valence) ||
      !Number.isFinite(result.arousal)
    ) {
      return;
    }

    const smoothingAlpha = 0.2;
    const previousValence = smoothedValenceRef.current;
    const previousArousal = smoothedArousalRef.current;

    const nextValence =
      previousValence === null
        ? result.valence
        : previousValence * (1 - smoothingAlpha) +
          result.valence * smoothingAlpha;

    const nextArousal =
      previousArousal === null
        ? result.arousal
        : previousArousal * (1 - smoothingAlpha) +
          result.arousal * smoothingAlpha;

    smoothedValenceRef.current = nextValence;
    smoothedArousalRef.current = nextArousal;

    const topEmotionProbability = Number.isFinite(result.topEmotionProbability) &&
      result.topEmotionProbability >= 0 &&
      result.topEmotionProbability <= 1
      ? result.topEmotionProbability
      : null;

    setAffectState({
      valence: nextValence,
      arousal: nextArousal,
      emotion: typeof result.emotion === "string" ? result.emotion : null,
      // Backward-compatible name: top softmax probability, not calibrated model confidence.
      confidence: topEmotionProbability,
      valid: true,
      source: result.source ?? "browser-onnx",
      updatedAt: Date.now(),
      latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : null,
    });

    setDebugDiagnosticSnapshot((previous) => mergeAffectDiagnostic(previous, {
      rawValence: result.valence,
      rawArousal: result.arousal,
      valence: nextValence,
      arousal: nextArousal,
      topEmotionProbabilities: result.topEmotionProbabilities,
      latencyMs: result.latencyMs,
      source: result.source ?? "browser-onnx",
      updatedAt: Date.now(),
    }));
  }, []);

  const resetAffectState = useCallback(() => {
    smoothedValenceRef.current = null;
    smoothedArousalRef.current = null;

    setAffectState({
      valence: null,
      arousal: null,
      emotion: null,
      confidence: null,
      valid: false,
      source: null,
      updatedAt: null,
      latencyMs: null,
    });
    setDebugDiagnosticSnapshot((previous) => ({
      ...previous,
      affect: createDefaultDiagnosticSnapshot().affect,
      performance: {
        ...previous.performance,
        affectLatencyMs: null,
      },
    }));
  }, []);

  const recordSessionObservation = useCallback((timestamp, faceDetected) => {
    const active = activeSessionRef.current;
    const clock = sessionClockRef.current;

    if (
      !active ||
      active.status !== SESSION_STATUS.ACTIVE ||
      !monitoringRef.current ||
      !clock.isRunning
    ) {
      return;
    }

    const currentAffect = affectStateRef.current;
    const dataValid = Boolean(
      monitoringRef.current &&
      cameraAllowedRef.current &&
      aiLoadedRef.current &&
      faceDetected
    );

    const recordedAt = new Date(timestamp).toISOString();
    const observation = {
      recordedAt,
      elapsedMs: getSessionElapsedMs(),
      attention: latestAttentionRef.current,
      fatigue: latestFatigueRef.current,
      valence: currentAffect.valid ? currentAffect.valence : null,
      arousal: currentAffect.valid ? currentAffect.arousal : null,
      emotion: currentAffect.valid ? currentAffect.emotion : null,
      emotionConfidence: currentAffect.valid ? currentAffect.confidence : null,
      faceDetected,
      affectValid: Boolean(currentAffect.valid),
      dataValid,
    };

    void sessionRuntimeRef.current.appendObservation(observation)
      .then((samples) => {
        if (samples.length > 0) {
          syncSessionState();
          addLog(`Metric sample committed (${samples.length}).`, "debug");
        }
      })
      .catch((error) => {
        console.error("Failed to append session observation:", error);
        addLog("Failed to aggregate session metrics.", "error");
      });
  }, [addLog, getSessionElapsedMs, syncSessionState]);

  const updateAiMetrics = useCallback((faceResults, gestureResults, latencyTime, videoDimensions = {}) => {
    setLatency(latencyTime);

    const timestamp = Date.now();
    const timeStr = new Date().toTimeString().split(" ")[0];
    const videoWidth = Number(videoDimensions.videoWidth) || 0;
    const videoHeight = Number(videoDimensions.videoHeight) || 0;

    let currentEyeOpenness = null;
    let averageEAR = null;
    let normalizedEyeOpenness = null;
    let blendshapeEyeOpenness = null;
    let yawValue = 0;
    let pitchValue = 0;
    let rollValue = 0;
    let isBlinkDetected = false;
    let isLongClosureDetected = false;
    let eyesClosed = false;
    let activeG = "None";
    let handsCount = 0;
    let detectedGestures = [];
    let primaryGestureDiagnostic = null;

    const frameLandmarks = {
      timestamp,
      face: [],
      hand: []
    };

    const faceDetected = faceResults?.faceLandmarks?.length > 0;
    processingFrameTimestampsRef.current = [
      ...processingFrameTimestampsRef.current.filter((time) => timestamp - time <= 1000),
      timestamp,
    ];

    if (faceDetected) {
      const landmarks = faceResults.faceLandmarks[0];
      frameLandmarks.face = landmarks.map((pt, idx) => ({ id: idx, x: pt.x, y: pt.y, z: pt.z }));

      const leftEAR = calculateEyeAspectRatio(landmarks, EYE_LANDMARKS.left, videoWidth, videoHeight);
      const rightEAR = calculateEyeAspectRatio(landmarks, EYE_LANDMARKS.right, videoWidth, videoHeight);
      averageEAR = calculateMean([leftEAR, rightEAR]);

      if (faceResults.faceBlendshapes?.length > 0) {
        const blendshapes = faceResults.faceBlendshapes[0].categories;
        const blinkLeft = blendshapes.find(b => b.categoryName === "eyeBlinkLeft")?.score || 0;
        const blinkRight = blendshapes.find(b => b.categoryName === "eyeBlinkRight")?.score || 0;
        blendshapeEyeOpenness = clamp(1 - (blinkLeft + blinkRight) / 2, 0, 1);
      }

      if (Number.isFinite(averageEAR) && averageEAR >= MIN_OPEN_EAR_SAMPLE && !baselineOpenEARRef.current) {
        if (!monitoringSessionStartedAtRef.current) {
          monitoringSessionStartedAtRef.current = timestamp;
        }

        const calibrationElapsed = timestamp - monitoringSessionStartedAtRef.current;
        if (calibrationElapsed <= EYE_CALIBRATION_WINDOW_MS) {
          eyeCalibrationSamplesRef.current.push(averageEAR);
        }
      }

      if (!baselineOpenEARRef.current && monitoringSessionStartedAtRef.current) {
        const calibrationElapsed = timestamp - monitoringSessionStartedAtRef.current;
        if (
          calibrationElapsed >= EYE_CALIBRATION_WINDOW_MS &&
          eyeCalibrationSamplesRef.current.length >= MIN_EYE_CALIBRATION_SAMPLES
        ) {
          baselineOpenEARRef.current = calculateMedian(eyeCalibrationSamplesRef.current);
        }
      }

      if (Number.isFinite(averageEAR) && Number.isFinite(baselineOpenEARRef.current) && baselineOpenEARRef.current > 0) {
        normalizedEyeOpenness = clamp(averageEAR / baselineOpenEARRef.current, 0, 1.2);
        currentEyeOpenness = normalizedEyeOpenness;
        setEyeOpenness(normalizedEyeOpenness);
        eyesClosed = normalizedEyeOpenness < EYE_CLOSED_THRESHOLD;
      }

      if (faceResults.facialTransformationMatrixes?.length > 0) {
        const matrix = faceResults.facialTransformationMatrixes[0].data;
        const r01 = matrix[1];
        const r11 = matrix[5];
        const r20 = matrix[8];
        const r21 = matrix[9];
        const r22 = matrix[10];

        yawValue = parseFloat((Math.atan2(r20, r22) * (180 / Math.PI)).toFixed(1));
        pitchValue = parseFloat((Math.atan2(-r21, Math.sqrt(r20 * r20 + r22 * r22)) * (180 / Math.PI)).toFixed(1));
        rollValue = parseFloat((Math.atan2(r01, r11) * (180 / Math.PI)).toFixed(1));

        setHeadPose({ yaw: yawValue, pitch: pitchValue, roll: rollValue });
      }
    }

    if (gestureResults?.landmarks?.length > 0) {
      handsCount = gestureResults.landmarks.length;

      gestureResults.landmarks.forEach((hand, handIndex) => {
        hand.forEach((point, pointIndex) => {
          frameLandmarks.hand.push({
            handId: handIndex,
            id: pointIndex,
            x: point.x,
            y: point.y,
            z: point.z,
          });
        });
      });

      detectedGestures = (gestureResults.gestures ?? [])
        .map((gestureCandidates, handIndex) => {
          const topGesture = gestureCandidates?.[0];
          if (!topGesture) return null;
          return {
            handId: handIndex,
            name: topGesture.categoryName,
            score: topGesture.score,
          };
        })
        .filter(
          (gesture) =>
            gesture !== null &&
            gesture.score > 0.45 &&
            gesture.name !== "None"
        );

      if (detectedGestures.length > 0) {
        const primaryGesture = detectedGestures.reduce(
          (best, current) =>
            current.score > best.score ? current : best
        );

        primaryGestureDiagnostic = primaryGesture;
        activeG = primaryGesture.name;
        setCurrentGesture(activeG);
      } else {
        activeG = "None";
        setCurrentGesture("None");
      }
      
      if (activeG !== previousGestureRef.current) {
        if (activeG !== "None") {
          addLog(`Gesture detected: ${activeG}`, "info");
        }
        previousGestureRef.current = activeG;
      }
    } else {
      activeG = "None";
      setCurrentGesture("None");
      previousGestureRef.current = "None";
 
    }
    setHasDetectedHand(handsCount > 0);

    if (handsCount >= 2) {
      bothHandsFrameCountRef.current += 1;
    } else {
      bothHandsFrameCountRef.current = 0;
    }

    if (bothHandsFrameCountRef.current === 10) {
      addLog(
        "Sustained two-hand activity detected.",
        "warning"
      );
    }

    if (faceDetected && normalizedEyeOpenness !== null) {
      if (eyesClosed) {
        if (!wasEyesClosedRef.current) {
          eyesClosedStartRef.current = timestamp;
          wasEyesClosedRef.current = true;
          longClosureRecordedRef.current = false;
        } else {
          const duration = timestamp - eyesClosedStartRef.current;
          if (duration > LONG_CLOSURE_MS && !longClosureRecordedRef.current) {
            isLongClosureDetected = true;
            longClosureRecordedRef.current = true;
            longClosureTimestampsRef.current.push(timestamp);
            addLog("Long eye closure detected.", "warning");
          }
        }
      } else if (wasEyesClosedRef.current) {
        const duration = timestamp - eyesClosedStartRef.current;
        wasEyesClosedRef.current = false;
        eyesClosedStartRef.current = null;
        longClosureRecordedRef.current = false;

        if (duration >= BLINK_MIN_MS && duration <= BLINK_MAX_MS) {
          isBlinkDetected = true;
          blinkTimestampsRef.current.push(timestamp);
          blinkEventsRef.current.push(timestamp);
          addLog("Blink detected.", "debug");
        }
      }
    } else if (!faceDetected) {
      wasEyesClosedRef.current = false;
      eyesClosedStartRef.current = null;
      longClosureRecordedRef.current = false;
    }

    const oneMinAgo = timestamp - OBSERVATION_WINDOW_MS;
    blinkTimestampsRef.current = blinkTimestampsRef.current.filter((time) => time > oneMinAgo);
    blinkEventsRef.current = blinkEventsRef.current.filter((time) => time > oneMinAgo);
    longClosureTimestampsRef.current = longClosureTimestampsRef.current.filter((time) => time > oneMinAgo);
    setBlinkRate(blinkTimestampsRef.current.length);

    if (isMonitoring) {
      observationsRef.current.push({
        timestamp,
        faceDetected,
        averageEAR,
        normalizedEyeOpenness,
        eyesClosed,
        yaw: yawValue,
        pitch: pitchValue,
        roll: rollValue,
        handsCount,
      });

      observationsRef.current = observationsRef.current.filter(
        (observation) => timestamp - observation.timestamp <= OBSERVATION_WINDOW_MS
      );
    }

    const recentQualityWindow = getRecentObservations(observationsRef.current, timestamp, ATTENTION_WINDOW_MS);
    const validFaceSamples = recentQualityWindow.filter((observation) => observation.faceDetected).length;
    const totalSamples = recentQualityWindow.length;
    const dataQualityRatio = totalSamples > 0 ? validFaceSamples / totalSamples : 0;
    const dataQuality =
      dataQualityRatio >= 0.8
        ? "good"
        : dataQualityRatio >= 0.5
          ? "limited"
          : "insufficient";

    const eyeCalibrationReady = Number.isFinite(baselineOpenEARRef.current) && baselineOpenEARRef.current > 0;
    const shouldRunEstimator =
      isMonitoring &&
      timestamp - lastEstimatorUpdateRef.current >= ESTIMATOR_INTERVAL_MS;

    let facePresenceScore = null;
    let forwardPoseScore = null;
    let headStabilityScore = null;
    let attentionRaw = null;
    let perclosScore = null;
    let closedEyeRatio = null;
    let longClosuresLastMinute = longClosureTimestampsRef.current.length;
    let longClosureScore = clamp(longClosuresLastMinute * 25, 0, 100);
    let blinkRateScore = 0;
    let currentBlinkRateEstimate = null;
    let fatigueRaw = null;

    if (shouldRunEstimator) {
      lastEstimatorUpdateRef.current = timestamp;

      const attentionWindow = getRecentObservations(observationsRef.current, timestamp, ATTENTION_WINDOW_MS);
      const faceSamples = attentionWindow.filter((observation) => observation.faceDetected);

      facePresenceScore = attentionWindow.length > 0
        ? (faceSamples.length / attentionWindow.length) * 100
        : null;

      const poseScores = faceSamples.map((observation) => {
        const yawScore = clamp(1 - Math.abs(observation.yaw) / 45, 0, 1);
        const pitchScore = clamp(1 - Math.abs(observation.pitch) / 35, 0, 1);
        return Math.min(yawScore, pitchScore) * 100;
      });

      forwardPoseScore = calculateMean(poseScores);

      const yawValues = faceSamples.map((observation) => observation.yaw);
      const pitchValues = faceSamples.map((observation) => observation.pitch);
      const yawStandardDeviation = calculateStandardDeviation(yawValues);
      const pitchStandardDeviation = calculateStandardDeviation(pitchValues);
      const movementLevel = Math.sqrt(yawStandardDeviation ** 2 + pitchStandardDeviation ** 2);
      headStabilityScore = movementLevel <= 4
        ? 100
        : clamp(100 - (movementLevel - 4) * 6, 0, 100);

      const estimatorDataReliable = dataQualityRatio >= 0.5 && eyeCalibrationReady;

      if (
        estimatorDataReliable &&
        Number.isFinite(facePresenceScore) &&
        Number.isFinite(forwardPoseScore) &&
        Number.isFinite(headStabilityScore)
      ) {
        attentionRaw =
          facePresenceScore * 0.30 +
          forwardPoseScore * 0.50 +
          headStabilityScore * 0.20;

        const attentionEstimate =
          attentionEstimateRef.current * 0.8 + attentionRaw * 0.2;
        attentionEstimateRef.current = clamp(attentionEstimate, 0, 100);
        setAttention(Math.round(attentionEstimateRef.current));
      }

      const fatigueWindow = getRecentObservations(observationsRef.current, timestamp, FATIGUE_WINDOW_MS);
      const validEyeSamples = fatigueWindow.filter(
        (observation) => Number.isFinite(observation.normalizedEyeOpenness)
      );
      const closedEyeSamples = validEyeSamples.filter((observation) => observation.eyesClosed);
      closedEyeRatio = validEyeSamples.length > 0
        ? closedEyeSamples.length / validEyeSamples.length
        : null;

      if (Number.isFinite(closedEyeRatio)) {
        perclosScore = clamp(((closedEyeRatio - 0.05) / 0.25) * 100, 0, 100);
      }

      const sessionAge = monitoringSessionStartedAtRef.current
        ? timestamp - monitoringSessionStartedAtRef.current
        : 0;

      if (
        !baselineBlinkRateRef.current &&
        sessionAge >= BLINK_BASELINE_MIN_MS &&
        dataQualityRatio >= 0.5
      ) {
        const elapsedMinutes = Math.max(sessionAge / 60000, 1 / 60);
        baselineBlinkRateRef.current = blinkTimestampsRef.current.length / elapsedMinutes;
      }

      if (baselineBlinkRateRef.current) {
        const currentWindowMinutes = Math.min(Math.max(sessionAge / 60000, 1 / 60), 1);
        const currentBlinkRate = blinkTimestampsRef.current.length / currentWindowMinutes;
        currentBlinkRateEstimate = currentBlinkRate;
        const blinkRateDeviation =
          Math.abs(currentBlinkRate - baselineBlinkRateRef.current) /
          Math.max(baselineBlinkRateRef.current, 1);
        blinkRateScore = blinkRateDeviation <= 0.3 ? 0 : clamp(((blinkRateDeviation - 0.3) / 0.7) * 100, 0, 100);
      }

      if (estimatorDataReliable && Number.isFinite(perclosScore)) {
        fatigueRaw =
          perclosScore * 0.55 +
          longClosureScore * 0.30 +
          blinkRateScore * 0.15;

        const fatigueEstimate =
          fatigueEstimateRef.current * 0.85 + fatigueRaw * 0.15;
        fatigueEstimateRef.current = clamp(fatigueEstimate, 0, 100);
        setFatigue(Math.round(fatigueEstimateRef.current));
      }
    }

    if (
      debugModeRef.current &&
      isMonitoring &&
      timestamp - lastDebugLogRef.current >= ESTIMATOR_INTERVAL_MS
    ) {
      lastDebugLogRef.current = timestamp;
      console.table([
        {
          averageEAR: roundForDebug(averageEAR),
          baselineOpenEAR: roundForDebug(baselineOpenEARRef.current),
          normalizedEyeOpenness: roundForDebug(normalizedEyeOpenness),
          blendshapeEyeOpenness: roundForDebug(blendshapeEyeOpenness),
          eyeCalibrationStatus: eyeCalibrationReady ? "ready" : "collecting",
          facePresenceScore: roundForDebug(facePresenceScore, 1),
          forwardPoseScore: roundForDebug(forwardPoseScore, 1),
          headStabilityScore: roundForDebug(headStabilityScore, 1),
          attentionRaw: roundForDebug(attentionRaw, 1),
          attentionEstimate: roundForDebug(attentionEstimateRef.current, 1),
          closedEyeRatio: roundForDebug(closedEyeRatio, 3),
          perclosScore: roundForDebug(perclosScore, 1),
          longClosuresLastMinute,
          longClosureScore: roundForDebug(longClosureScore, 1),
          currentBlinkRate: blinkTimestampsRef.current.length,
          baselineBlinkRate: roundForDebug(baselineBlinkRateRef.current, 1),
          blinkRateScore: roundForDebug(blinkRateScore, 1),
          fatigueRaw: roundForDebug(fatigueRaw, 1),
          fatigueEstimate: roundForDebug(fatigueEstimateRef.current, 1),
          dataQuality,
          observationCount: observationsRef.current.length,
        },
      ]);
    }

    if (timestamp - lastDiagnosticSnapshotAtRef.current >= DIAGNOSTIC_SNAPSHOT_INTERVAL_MS) {
      lastDiagnosticSnapshotAtRef.current = timestamp;
      const measuredProcessingFps = processingFrameTimestampsRef.current.length;
      const calibrationElapsedMs = monitoringSessionStartedAtRef.current
        ? timestamp - monitoringSessionStartedAtRef.current
        : 0;

      setFps(measuredProcessingFps);
      setDebugDiagnosticSnapshot((previous) => {
        const estimatorSnapshot = createEstimatorDiagnosticSnapshot({
          now: timestamp,
          isMonitoring,
          isCameraAllowed: cameraAllowedRef.current,
          isAiLoaded: aiLoadedRef.current,
          attention: attentionEstimateRef.current,
          fatigue: fatigueEstimateRef.current,
          averageEAR,
          baselineEAR: baselineOpenEARRef.current,
          calibrationElapsedMs,
          calibrationTargetMs: EYE_CALIBRATION_WINDOW_MS,
          calibrationSampleCount: eyeCalibrationSamplesRef.current.length,
          calibrationMinimumSamples: MIN_EYE_CALIBRATION_SAMPLES,
          eyeCalibrationReady,
          facePresenceScore,
          forwardPoseScore,
          headStabilityScore,
          attentionRaw,
          closedEyeRatio,
          perclosScore,
          longEyeClosureCount: longClosuresLastMinute,
          currentBlinkRate: currentBlinkRateEstimate ?? blinkTimestampsRef.current.length,
          baselineBlinkRate: baselineBlinkRateRef.current,
          blinkRateScore,
          fatigueRaw,
          dataQualityRatio,
          dataQuality,
          validFaceObservations: validFaceSamples,
          totalObservations: totalSamples,
          detectedHandCount: handsCount,
          primaryGesture: primaryGestureDiagnostic?.name ?? activeG,
          primaryGestureScore: primaryGestureDiagnostic?.score ?? null,
          twoHandFrames: bothHandsFrameCountRef.current,
          targetInferenceFps: inferenceFps,
          measuredProcessingFps,
          mediaPipeLatencyMs: latencyTime,
          affectLatencyMs: previous.performance.affectLatencyMs,
        });

        return {
          ...estimatorSnapshot,
          affect: previous.affect,
        };
      });
    }

    recordSessionObservation(timestamp, faceDetected);

    if (debugModeRef.current && isMonitoring) {
      const tableRow = {
        id: timestamp,
        time: timeStr,
        eyeOpenness: currentEyeOpenness,
        blink: isBlinkDetected ? "Yes" : "No",
        longClosure: isLongClosureDetected ? "Yes" : "No",
        yaw: yawValue,
        pitch: pitchValue,
        gesture: activeG,
        hands: handsCount
      };
      setTelemetryTable((prev) => [tableRow, ...prev.slice(0, 49)]);
    }

    if (debugModeRef.current && sensitiveDebugPreviewRef.current && isMonitoring) {
      setRawLandmarksHistory((prev) => [frameLandmarks, ...prev.slice(0, 49)]);
    }
  }, [isMonitoring, inferenceFps, addLog, recordSessionObservation]);

  const exportTelemetryCSV = useCallback(() => {
    if (rawLandmarksHistory.length === 0) {
      alert("No raw landmarks captured yet. Enable Debug Mode, open Advanced / Sensitive Data, and show the temporary face crop before exporting.");
      return;
    }

    let csvContent = "Timestamp,Source,Point_ID,X,Y,Z\n";

    rawLandmarksHistory.forEach((frame) => {
      const ts = frame.timestamp;
      frame.face.forEach((pt) => {
        csvContent += `${ts},face,${pt.id},${pt.x.toFixed(4)},${pt.y.toFixed(4)},${pt.z.toFixed(4)}\n`;
      });
      frame.hand.forEach((pt) => {
        csvContent += `${ts},hand_${pt.handId},${pt.id},${pt.x.toFixed(4)},${pt.y.toFixed(4)},${pt.z.toFixed(4)}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `aegismind_raw_landmarks_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog("Exported raw landmark table to CSV.", "success");
  }, [addLog, rawLandmarksHistory]);

  const clearCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCameraStream(null);
    setIsCameraAllowed(false);
    cameraAllowedRef.current = false;
    setCameraStatus("off");
  }, []);

  const resetTransientInferenceState = useCallback(() => {
    resetAffectState();
    setAffectModelStatus("idle");
    setCurrentGesture("None");
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);
    setRuntimeStatus("idle");
    setDebugDiagnosticSnapshot(createDefaultDiagnosticSnapshot());
    setRawLandmarksHistory([]);
  }, [resetAffectState]);

  const prepareSession = useCallback(async ({
    taskName = "",
    taskDescription = "",
    targetDurationMs = null,
    sessionPlan = null,
    subject = null,
    customSubject = null,
    taskType = null,
    customTaskType = null,
    sessionGoal = null,
    preSessionCheckIn = null,
  } = {}) => {
    const existing = activeSessionRef.current;
    if (existing) {
      return existing;
    }

    setIsMonitoring(false);
    resetSessionClock();
    resetEstimatorSession(SESSION_START_BASELINE.attention, SESSION_START_BASELINE.fatigue);

    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);
    setTimedBreakState(createIdleBreakState());

    const normalizedSessionPlan = normalizeSessionPlan(sessionPlan, { targetDurationMs });
    const breakEvents = calculatePlannedBreakPositions(normalizedSessionPlan).map((plannedStartElapsedMs, index) => ({
      id: `planned-break-${index + 1}`,
      plannedStartElapsedMs,
      baseDurationMs: normalizedSessionPlan.breakDurationMs,
      status: BREAK_STATUS.SCHEDULED,
    }));

    const session = await sessionRuntimeRef.current.prepareSession({
      taskName,
      taskDescription,
      targetDurationMs,
      sessionPlan: normalizedSessionPlan,
      breakEvents,
      subject,
      customSubject,
      taskType,
      customTaskType,
      sessionGoal,
      preSessionCheckIn,
    });

    syncSessionState();
    addLog("Study session prepared. Camera permission is required to begin monitoring.", "info");
    return session;
  }, [addLog, resetEstimatorSession, resetSessionClock, syncSessionState]);

  const activatePreparedSession = useCallback(async () => {
    const active = activeSessionRef.current;
    if (!active) return null;

    if (!cameraAllowedRef.current || !streamRef.current) {
      setShowCameraDialog(true);
      return null;
    }

    if (active.status === SESSION_STATUS.ACTIVE) {
      return active;
    }

    return runResumeTransition(async () => {
      const session = active.status === SESSION_STATUS.PREPARED
        ? await sessionRuntimeRef.current.activatePreparedSession()
        : await sessionRuntimeRef.current.resumeSession();

      if (active.status === SESSION_STATUS.PREPARED) {
        resetEstimatorSession(SESSION_START_BASELINE.attention, SESSION_START_BASELINE.fatigue);
        startSessionClockFromZero();
        const checkpointedAt = new Date().toISOString();
        setCheckpointStatus((previous) => ({
          ...previous,
          state: "writing",
          lastAttemptedAt: checkpointedAt,
          reason: "start",
          error: null,
        }));
        const checkpointedSession = await sessionRuntimeRef.current.checkpointActiveSession(0, { checkpointedAt, reason: "start" });
        setCheckpointStatus({
          state: "saved",
          lastAttemptedAt: checkpointedAt,
          lastCommittedAt: checkpointedSession?.lastCheckpointAt || checkpointedAt,
          reason: "start",
          error: null,
        });
      } else if (active.recoveryPending === true) {
        const elapsedMs = Number.isFinite(active.accumulatedStudyMs)
          ? Math.max(0, active.accumulatedStudyMs)
          : 0;
        startSessionClockFromElapsed(elapsedMs);
        sessionClockRef.current = {
          accumulatedMs: elapsedMs,
          runningSince: Date.now(),
          isRunning: true,
        };
      } else {
        startSessionClock();
      }

      setRecoveryPromptDismissedSessionId(null);
      setIsMonitoring(true);
      syncSessionState();
      addLog(active.status === SESSION_STATUS.PREPARED ? "Study session started." : "Study session resumed.", "success");
      return session;
    });
  }, [addLog, resetEstimatorSession, runResumeTransition, startSessionClock, startSessionClockFromElapsed, startSessionClockFromZero, syncSessionState]);

  const startSession = prepareSession;

  const pauseSession = useCallback(async ({ silent = false } = {}) => {
    const active = activeSessionRef.current;
    if (!active) return null;

    if (active.status === SESSION_STATUS.PREPARED) {
      setIsMonitoring(false);
      resetSessionClock();
      return active;
    }

    const elapsedMs = freezeSessionClock();
    setIsMonitoring(false);

    await sessionRuntimeRef.current.pauseSession(elapsedMs);
    syncSessionState();

    if (!silent) {
      addLog("Study session paused.", "warning");
    }

    return sessionRuntimeRef.current.getSnapshot().activeSession;
  }, [addLog, freezeSessionClock, resetSessionClock, syncSessionState]);

  const resumeSession = useCallback(async () => {
    const active = activeSessionRef.current;
    if (!active) return null;

    if (active.status === SESSION_STATUS.PREPARED) {
      return activatePreparedSession();
    }

    if (!cameraAllowedRef.current || !streamRef.current) {
      setShowCameraDialog(true);
      return null;
    }

    return runResumeTransition(async () => {
      const session = await sessionRuntimeRef.current.resumeSession();
      startSessionClock();
      setRecoveryPromptDismissedSessionId(null);
      setIsMonitoring(true);
      syncSessionState();
      addLog("Study session resumed.", "success");
      return session;
    });
  }, [activatePreparedSession, addLog, runResumeTransition, startSessionClock, syncSessionState]);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        setIsCameraAllowed(true);
        cameraAllowedRef.current = true;
        setCameraStatus("ready");
        return streamRef.current;
      }

      setCameraStatus("requesting");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false
      });

      setCameraStream(stream);
      streamRef.current = stream;
      setIsCameraAllowed(true);
      cameraAllowedRef.current = true;
      setCameraStatus("ready");
      addLog("Camera access granted. Live stream connected.", "success");
      return stream;
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setIsCameraAllowed(false);
      cameraAllowedRef.current = false;
      setCameraStatus("error");
      addLog("Camera access denied or unavailable.", "error");
      throw err;
    }
  }, [addLog]);

  const stopCamera = useCallback(async ({ pauseActiveSession = true } = {}) => {
    const active = activeSessionRef.current;
    const shouldPause = pauseActiveSession && active?.status === SESSION_STATUS.ACTIVE;
    const elapsedMs = shouldPause ? freezeSessionClock() : getSessionElapsedMs();

    setIsMonitoring(false);
    clearCameraStream();
    resetTransientInferenceState();

    if (shouldPause) {
      await sessionRuntimeRef.current.pauseSession(elapsedMs);
      syncSessionState();
    }

    addLog("Camera stream stopped. Study session data was preserved.", "info");
    return true;
  }, [addLog, clearCameraStream, freezeSessionClock, getSessionElapsedMs, resetTransientInferenceState, syncSessionState]);

  const persistBreakSession = useCallback(async (nextSession, input = {}) => {
    const saved = await sessionRuntimeRef.current.updateBreakEvents(nextSession.breakEvents, input);
    syncSessionState();
    return saved;
  }, [syncSessionState]);

  const runBreakAction = useCallback((operation) => {
    if (breakActionPromiseRef.current) return breakActionPromiseRef.current;
    const promise = operation().finally(() => {
      breakActionPromiseRef.current = null;
    });
    breakActionPromiseRef.current = promise;
    return promise;
  }, []);

  const enterBreakReady = useCallback((breakEvent) => runBreakAction(async () => {
    const active = activeSessionRef.current;
    if (!active || !breakEvent || timedBreakStateRef.current.breakId === breakEvent.id) return null;
    const elapsedMs = freezeSessionClock();
    await sessionRuntimeRef.current.flushPendingObservations({ force: true });
    const readyAt = new Date().toISOString();
    const nextSession = markBreakReady(active, breakEvent.id, {
      readyAt,
      baseDurationMs: breakEvent.baseDurationMs || active.sessionPlan?.breakDurationMs,
    });
    await persistBreakSession(nextSession, { accumulatedStudyMs: elapsedMs, lastCheckpointAt: readyAt });
    stopAudio("study");
    playSessionAudio("shortAlarm", { loop: false, restart: true });
    setTimedBreakState({
      ...createIdleBreakState(),
      phase: BREAK_PHASE.READY,
      breakId: breakEvent.id,
      plannedStartElapsedMs: breakEvent.plannedStartElapsedMs,
      baseDurationMs: breakEvent.baseDurationMs || active.sessionPlan?.breakDurationMs || 0,
    });
    addLog("Planned break is ready.", "info");
    return nextSession;
  }), [addLog, freezeSessionClock, persistBreakSession, playSessionAudio, runBreakAction, stopAudio]);

  const requestSkipBreak = useCallback(() => {
    setTimedBreakState((previous) => previous.phase === BREAK_PHASE.READY
      ? { ...previous, phase: BREAK_PHASE.SKIP_CONFIRMATION }
      : previous);
  }, []);

  const cancelSkipBreak = useCallback(() => {
    setTimedBreakState((previous) => previous.phase === BREAK_PHASE.SKIP_CONFIRMATION
      ? { ...previous, phase: BREAK_PHASE.READY }
      : previous);
  }, []);

  const confirmSkipBreak = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const state = timedBreakStateRef.current;
    if (!active || state.phase !== BREAK_PHASE.SKIP_CONFIRMATION || !state.breakId) return null;
    stopAudio("shortAlarm");
    const skippedAt = new Date().toISOString();
    const elapsedMs = getSessionElapsedMs();
    const nextSession = skipBreak(active, state.breakId, {
      actualEndElapsedMs: elapsedMs,
      actualEndAt: skippedAt,
    });
    await persistBreakSession(nextSession, { accumulatedStudyMs: elapsedMs, lastCheckpointAt: skippedAt });
    setTimedBreakState(createIdleBreakState());
    startSessionClock();
    setIsMonitoring(true);
    monitoringRef.current = true;
    addLog("Planned break skipped.", "warning");
    return nextSession;
  }), [addLog, getSessionElapsedMs, persistBreakSession, runBreakAction, startSessionClock, stopAudio]);

  const startReadyBreak = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const state = timedBreakStateRef.current;
    if (!active || state.phase !== BREAK_PHASE.READY || !state.breakId) return null;
    stopAudio("shortAlarm");
    stopAudio("study");
    const startedAt = new Date().toISOString();
    const baseDurationMs = state.baseDurationMs || active.sessionPlan?.breakDurationMs || 0;
    const elapsedMs = getSessionElapsedMs();
    const nextSession = startPlannedBreak(active, state.breakId, {
      actualStartElapsedMs: elapsedMs,
      actualStartAt: startedAt,
      baseDurationMs,
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: baseDurationMs,
    });
    setIsMonitoring(false);
    monitoringRef.current = false;
    clearCameraStream();
    resetTransientInferenceState();
    await persistBreakSession(nextSession, { accumulatedStudyMs: elapsedMs, lastCheckpointAt: startedAt });
    setTimedBreakState({
      ...createIdleBreakState(),
      phase: BREAK_PHASE.ACTIVE,
      breakId: state.breakId,
      plannedStartElapsedMs: state.plannedStartElapsedMs,
      baseDurationMs,
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: baseDurationMs,
      remainingMs: baseDurationMs,
    });
    playSessionAudio("break", { loop: true, restart: true });
    if (pathname !== "/app/focus") router.push("/app/focus");
    addLog("Planned break started. Camera and monitoring are stopped during break time.", "info");
    return nextSession;
  }), [addLog, clearCameraStream, getSessionElapsedMs, pathname, persistBreakSession, playSessionAudio, resetTransientInferenceState, router, runBreakAction, stopAudio]);

  const completeActiveBreakSegment = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const state = timedBreakStateRef.current;
    if (!active || state.phase !== BREAK_PHASE.ACTIVE || !state.breakId) return null;
    const event = findBreakEvent(active, state.breakId);
    if (!event) return null;
    stopAudio("break");
    const nowIso = new Date().toISOString();
    if ((event.extensionCount || 0) >= MAX_BREAK_EXTENSION_COUNT) {
      const nextSession = completeBreak(active, state.breakId, {
        actualEndElapsedMs: getSessionElapsedMs(),
        actualEndAt: nowIso,
        actualActiveBreakDurationMs: (event.baseDurationMs || state.baseDurationMs || 0) + (event.totalExtensionDurationMs || 0),
        totalExtensionDurationMs: event.totalExtensionDurationMs || 0,
      });
      await persistBreakSession(nextSession, {
        accumulatedStudyMs: getSessionElapsedMs(),
        status: SESSION_STATUS.PAUSED,
        recoveryPending: false,
        lastCheckpointAt: nowIso,
      });
      setIsMonitoring(false);
      monitoringRef.current = false;
      setTimedBreakState({ ...createIdleBreakState(), phase: BREAK_PHASE.PAUSED_FALLBACK });
      addLog("Break extension limit reached. The study session is paused until you are ready.", "warning");
      return nextSession;
    }
    const nextSession = markBreakDecisionStarted(active, state.breakId, { decisionStartedAt: nowIso });
    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: nowIso });
    setTimedBreakState((previous) => ({
      ...previous,
      phase: BREAK_PHASE.COMPLETE_DECISION,
      activeSegmentStartedAt: null,
      activeSegmentDurationMs: 0,
      remainingMs: 0,
      decisionStartedAt: nowIso,
      decisionElapsedMs: 0,
      extensionCount: event.extensionCount || 0,
    }));
    playSessionAudio("longAlarm", { loop: false, restart: true });
    return nextSession;
  }), [addLog, getSessionElapsedMs, persistBreakSession, playSessionAudio, runBreakAction, stopAudio]);

  const extendBreak = useCallback((source = "manual") => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const state = timedBreakStateRef.current;
    if (!active || state.phase !== BREAK_PHASE.COMPLETE_DECISION || !state.breakId) return null;
    const event = findBreakEvent(active, state.breakId);
    if (!event || (event.extensionCount || 0) >= MAX_BREAK_EXTENSION_COUNT) return null;
    stopAudio("longAlarm");
    const startedAt = new Date().toISOString();
    const nextSession = startBreakExtension(active, state.breakId, {
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: BREAK_EXTENSION_MS,
      source,
    });
    const nextEvent = findBreakEvent(nextSession, state.breakId);
    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: startedAt });
    setTimedBreakState((previous) => ({
      ...previous,
      phase: BREAK_PHASE.ACTIVE,
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: BREAK_EXTENSION_MS,
      remainingMs: BREAK_EXTENSION_MS,
      decisionStartedAt: null,
      decisionElapsedMs: 0,
      extensionCount: nextEvent?.extensionCount || previous.extensionCount + 1,
    }));
    playSessionAudio("break", { loop: true, restart: true });
    return nextSession;
  }), [getSessionElapsedMs, persistBreakSession, playSessionAudio, runBreakAction, stopAudio]);

  const continueStudyAfterBreak = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const state = timedBreakStateRef.current;
    if (!active || state.phase !== BREAK_PHASE.COMPLETE_DECISION || !state.breakId) return null;
    const event = findBreakEvent(active, state.breakId);
    stopAudio("longAlarm");
    const endedAt = new Date().toISOString();
    const activeBreakDuration = (event?.baseDurationMs || state.baseDurationMs || 0) + (event?.totalExtensionDurationMs || 0);
    const nextSession = completeBreak(active, state.breakId, {
      actualEndElapsedMs: getSessionElapsedMs(),
      actualEndAt: endedAt,
      actualActiveBreakDurationMs: activeBreakDuration,
      totalExtensionDurationMs: event?.totalExtensionDurationMs || 0,
    });
    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: endedAt });
    try {
      await startCamera();
      startSessionClock();
      setIsMonitoring(true);
      monitoringRef.current = true;
      setTimedBreakState(createIdleBreakState());
      addLog("Study session resumed after break.", "success");
      return nextSession;
    } catch (error) {
      const paused = await sessionRuntimeRef.current.updateBreakEvents(nextSession.breakEvents, {
        accumulatedStudyMs: getSessionElapsedMs(),
        status: SESSION_STATUS.PAUSED,
        recoveryPending: false,
        lastCheckpointAt: endedAt,
      });
      syncSessionState();
      setTimedBreakState(createIdleBreakState());
      setShowCameraDialog(true);
      addLog("Camera could not restart after the break. The session is paused safely.", "error");
      return paused;
    }
  }), [addLog, getSessionElapsedMs, persistBreakSession, runBreakAction, startCamera, startSessionClock, stopAudio, syncSessionState]);

  const requestEndBreakEarly = useCallback(() => {
    setTimedBreakState((previous) => previous.phase === BREAK_PHASE.ACTIVE
      ? { ...previous, phase: BREAK_PHASE.END_EARLY_CONFIRMATION }
      : previous);
  }, []);

  const cancelEndBreakEarly = useCallback(() => {
    setTimedBreakState((previous) => previous.phase === BREAK_PHASE.END_EARLY_CONFIRMATION
      ? { ...previous, phase: BREAK_PHASE.ACTIVE }
      : previous);
  }, []);

  const confirmEndBreakEarly = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const state = timedBreakStateRef.current;
    if (!active || state.phase !== BREAK_PHASE.END_EARLY_CONFIRMATION || !state.breakId) return null;
    const endedAt = new Date().toISOString();
    const event = findBreakEvent(active, state.breakId);
    stopAudio("break");
    const activeSegmentStarted = Date.parse(state.activeSegmentStartedAt || event?.activeSegmentStartedAt || "");
    const partialActiveMs = Number.isFinite(activeSegmentStarted) ? Math.max(0, Date.now() - activeSegmentStarted) : 0;
    const previousExtensionMs = Math.max(0, (event?.extensionCount || 0) * BREAK_EXTENSION_MS - (event?.activeSegmentDurationMs === BREAK_EXTENSION_MS ? BREAK_EXTENSION_MS : 0));
    const activeBreakDuration = Math.min(
      (event?.baseDurationMs || state.baseDurationMs || 0) + (event?.totalExtensionDurationMs || 0),
      (event?.baseDurationMs || state.baseDurationMs || 0) + previousExtensionMs + partialActiveMs
    );
    const nextSession = completeBreak(active, state.breakId, {
      actualEndElapsedMs: getSessionElapsedMs(),
      actualEndAt: endedAt,
      actualActiveBreakDurationMs: activeBreakDuration,
      totalExtensionDurationMs: event?.totalExtensionDurationMs || 0,
    });
    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: endedAt });
    try {
      await startCamera();
      startSessionClock();
      setIsMonitoring(true);
      monitoringRef.current = true;
      setTimedBreakState(createIdleBreakState());
      addLog("Study session resumed after ending the break early.", "success");
      return nextSession;
    } catch {
      const paused = await sessionRuntimeRef.current.updateBreakEvents(nextSession.breakEvents, {
        accumulatedStudyMs: getSessionElapsedMs(),
        status: SESSION_STATUS.PAUSED,
        recoveryPending: false,
        lastCheckpointAt: endedAt,
      });
      syncSessionState();
      setTimedBreakState(createIdleBreakState());
      setShowCameraDialog(true);
      addLog("Camera could not restart after the break. The session is paused safely.", "error");
      return paused;
    }
  }), [addLog, getSessionElapsedMs, persistBreakSession, runBreakAction, startCamera, startSessionClock, stopAudio, syncSessionState]);

  const returnToRecoveredSession = useCallback(async () => {
    const active = activeSessionRef.current;
    if (!active || active.recoveryPending !== true) return null;

    const elapsedMs = Number.isFinite(active.accumulatedStudyMs)
      ? Math.max(0, active.accumulatedStudyMs)
      : 0;

    setIsMonitoring(false);
    monitoringRef.current = false;
    clearCameraStream();
    resetTransientInferenceState();
    sessionClockRef.current = {
      accumulatedMs: elapsedMs,
      runningSince: null,
      isRunning: false,
    };
    setSessionClock(sessionClockRef.current);
    setRecoveryPromptDismissedSessionId(active.id);
    syncSessionState();
    addLog("Recovered study session returned to Study Space. Choose how to continue.", "info");
    return active;
  }, [addLog, clearCameraStream, resetTransientInferenceState, syncSessionState]);

  const finishSession = useCallback(async ({ postSessionCheckOut = null } = {}) => {
    if (!activeSessionRef.current) return null;

    const elapsedMs = getSessionElapsedMs();
    setIsMonitoring(false);
    stopAllSessionAudio();

    const activeBreak = normalizeBreakEvents(activeSessionRef.current.breakEvents || [])
      .find((event) => [BREAK_STATUS.SCHEDULED, BREAK_STATUS.ACTIVE].includes(event.status));
    if (activeBreak) {
      const cancelled = cancelBreak(activeSessionRef.current, activeBreak.id, {
        actualEndElapsedMs: elapsedMs,
        actualEndAt: new Date().toISOString(),
      });
      await sessionRuntimeRef.current.updateBreakEvents(cancelled.breakEvents, { accumulatedStudyMs: elapsedMs });
      syncSessionState();
    }

    const completed = await sessionRuntimeRef.current.finishSession(elapsedMs, { postSessionCheckOut });
    clearCameraStream();
    resetTransientInferenceState();
    resetSessionClock();
    setTimedBreakState(createIdleBreakState());
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);
    setRecoveryPromptDismissedSessionId(null);
    syncSessionState();
    addLog("Study session finished and summarized.", "success");
    return completed;
  }, [addLog, clearCameraStream, getSessionElapsedMs, resetSessionClock, resetTransientInferenceState, stopAllSessionAudio, syncSessionState]);

  const discardSession = useCallback(async () => {
    if (!activeSessionRef.current) return false;

    setIsMonitoring(false);
    stopAllSessionAudio();
    clearCameraStream();
    resetTransientInferenceState();
    const discarded = await sessionRuntimeRef.current.discardSession();
    resetSessionClock();
    setTimedBreakState(createIdleBreakState());
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);
    setRecoveryPromptDismissedSessionId(null);
    syncSessionState();
    addLog("Study session discarded.", "warning");
    return discarded;
  }, [addLog, clearCameraStream, resetSessionClock, resetTransientInferenceState, stopAllSessionAudio, syncSessionState]);

  const updateSessionTask = useCallback(async (taskDescription) => {
    const session = await sessionRuntimeRef.current.updateSessionTask(taskDescription);
    syncSessionState();
    return session;
  }, [syncSessionState]);

  const updateTargetDuration = useCallback(async (targetDurationMs) => {
    const session = await sessionRuntimeRef.current.updateTargetDuration(targetDurationMs);
    syncSessionState();
    return session;
  }, [syncSessionState]);

  const getSessionById = useCallback((sessionId) => (
    sessionRuntimeRef.current.getSessionById(sessionId)
  ), []);

  const getMetricSamples = useCallback((sessionId) => (
    sessionRuntimeRef.current.getMetricSamples(sessionId)
  ), []);

  const persistActiveSessionCheckpoint = useCallback(async (reason = "interval") => {
    const active = activeSessionRef.current;
    const clock = sessionClockRef.current;

    if (!active || active.status !== SESSION_STATUS.ACTIVE || !clock.isRunning) {
      return null;
    }

    const checkpointedAt = new Date().toISOString();
    setCheckpointStatus((previous) => ({
      ...previous,
      state: "writing",
      lastAttemptedAt: checkpointedAt,
      reason,
      error: null,
    }));

    try {
      const session = await sessionRuntimeRef.current.checkpointActiveSession(getSessionElapsedMs(), {
        checkpointedAt,
        reason,
      });
      lastCheckpointFailureRef.current = null;
      setCheckpointStatus({
        state: "saved",
        lastAttemptedAt: checkpointedAt,
        lastCommittedAt: session?.lastCheckpointAt || checkpointedAt,
        reason,
        error: null,
      });
      addLog(`Study-time checkpoint committed (${reason}).`, "debug");
      syncSessionState();
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to checkpoint active study session:", error);
      setCheckpointStatus({
        state: "error",
        lastAttemptedAt: checkpointedAt,
        lastCommittedAt: active.lastCheckpointAt || null,
        reason,
        error: "Checkpoint write failed.",
      });
      if (lastCheckpointFailureRef.current !== message) {
        lastCheckpointFailureRef.current = message;
        addLog("Could not save the latest study-time checkpoint. Local storage may be unavailable.", "error");
      }
      throw error;
    }
  }, [addLog, getSessionElapsedMs, syncSessionState]);

  useEffect(() => {
    if (activeSession?.status !== SESSION_STATUS.ACTIVE || !sessionClock.isRunning) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void persistActiveSessionCheckpoint("interval").catch(() => {});
    }, SESSION_CHECKPOINT_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [activeSession?.id, activeSession?.status, persistActiveSessionCheckpoint, sessionClock.isRunning]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void persistActiveSessionCheckpoint("visibility-hidden").catch(() => {});
      }
    };

    const handlePageHide = () => {
      void persistActiveSessionCheckpoint("pagehide").catch(() => {});
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [persistActiveSessionCheckpoint]);

  useEffect(() => {
    const active = activeSession;
    if (!active || active.status !== SESSION_STATUS.ACTIVE || isBreakBlockingPhase(timedBreakState.phase)) {
      return undefined;
    }
    const plan = normalizeSessionPlan(active.sessionPlan, { targetDurationMs: active.targetDurationMs });
    if (!plan.focusDurationMs || !plan.breakDurationMs || plan.plannedBreakCount <= 0) {
      return undefined;
    }

    const evaluate = () => {
      const currentSession = activeSessionRef.current;
      const currentState = timedBreakStateRef.current;
      if (!currentSession || currentSession.status !== SESSION_STATUS.ACTIVE || isBreakBlockingPhase(currentState.phase)) return;
      const nextBreak = getNextScheduledBreakEvent(currentSession);
      if (!nextBreak || !Number.isFinite(nextBreak.plannedStartElapsedMs)) {
        if (currentState.phase === BREAK_PHASE.WARNING) setTimedBreakState(createIdleBreakState());
        return;
      }

      const elapsedMs = getSessionElapsedMs();
      const remainingMs = nextBreak.plannedStartElapsedMs - elapsedMs;
      if (remainingMs <= 0) {
        void enterBreakReady(nextBreak).catch((error) => {
          console.error("Failed to enter planned break ready state:", error);
          addLog("Could not open the planned break prompt.", "error");
        });
        return;
      }

      if (remainingMs <= PRE_BREAK_WARNING_MS) {
        if (!nextBreak.warningShownAt) {
          const warningAt = new Date().toISOString();
          const nextSession = markBreakWarningShown(currentSession, nextBreak.id, { warningShownAt: warningAt });
          void persistBreakSession(nextSession, {
            accumulatedStudyMs: elapsedMs,
            lastCheckpointAt: warningAt,
          }).catch((error) => {
            console.error("Failed to persist break warning:", error);
          });
        }
        setTimedBreakState({
          ...createIdleBreakState(),
          phase: BREAK_PHASE.WARNING,
          breakId: nextBreak.id,
          plannedStartElapsedMs: nextBreak.plannedStartElapsedMs,
          baseDurationMs: nextBreak.baseDurationMs || currentSession.sessionPlan?.breakDurationMs || 0,
          remainingMs,
        });
      } else if (currentState.phase === BREAK_PHASE.WARNING) {
        setTimedBreakState(createIdleBreakState());
      }
    };

    evaluate();
    if (!sessionClock.isRunning) return undefined;
    const interval = window.setInterval(evaluate, 500);
    return () => window.clearInterval(interval);
  }, [
    activeSession,
    addLog,
    enterBreakReady,
    getSessionElapsedMs,
    persistBreakSession,
    sessionClock.isRunning,
    timedBreakState.phase,
  ]);

  useEffect(() => {
    if (timedBreakState.phase !== BREAK_PHASE.ACTIVE || !timedBreakState.activeSegmentStartedAt) {
      return undefined;
    }

    const tick = () => {
      const state = timedBreakStateRef.current;
      if (state.phase !== BREAK_PHASE.ACTIVE || !state.activeSegmentStartedAt) return;
      const startedAt = Date.parse(state.activeSegmentStartedAt);
      const durationMs = state.activeSegmentDurationMs || state.baseDurationMs || 0;
      const remainingMs = Math.max(0, startedAt + durationMs - Date.now());
      setTimedBreakState((previous) => previous.phase === BREAK_PHASE.ACTIVE
        ? { ...previous, remainingMs }
        : previous);
      if (remainingMs <= 0) {
        void completeActiveBreakSegment().catch((error) => {
          console.error("Failed to complete break segment:", error);
          addLog("Could not complete the planned break cleanly.", "error");
        });
      }
    };

    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [addLog, completeActiveBreakSegment, timedBreakState.activeSegmentStartedAt, timedBreakState.phase]);

  useEffect(() => {
    if (timedBreakState.phase !== BREAK_PHASE.COMPLETE_DECISION || !timedBreakState.decisionStartedAt) {
      return undefined;
    }

    const tick = () => {
      const state = timedBreakStateRef.current;
      const active = activeSessionRef.current;
      if (state.phase !== BREAK_PHASE.COMPLETE_DECISION || !state.decisionStartedAt || !active || !state.breakId) return;
      const decisionElapsedMs = Math.max(0, Date.now() - Date.parse(state.decisionStartedAt));
      setTimedBreakState((previous) => previous.phase === BREAK_PHASE.COMPLETE_DECISION
        ? { ...previous, decisionElapsedMs }
        : previous);
      const event = findBreakEvent(active, state.breakId);
      if (
        event &&
        decisionElapsedMs >= BREAK_DECISION_ALARM_REPLAY_MS &&
        !event.decisionAlarmReplayedAt
      ) {
        const replayedAt = new Date().toISOString();
        const nextSession = markBreakDecisionAlarmReplayed(active, state.breakId, { decisionAlarmReplayedAt: replayedAt });
        void persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: replayedAt });
        playSessionAudio("longAlarm", { loop: false, restart: true });
      }
      if (decisionElapsedMs >= BREAK_DECISION_WAIT_MS && (event?.extensionCount || 0) < MAX_BREAK_EXTENSION_COUNT) {
        void extendBreak("automatic").catch((error) => {
          console.error("Failed to auto-extend break:", error);
        });
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [extendBreak, getSessionElapsedMs, persistBreakSession, playSessionAudio, timedBreakState.decisionStartedAt, timedBreakState.phase]);

  useEffect(() => {
    if (!activeSession) {
      stopAllSessionAudio();
      return;
    }

    const events = normalizeBreakEvents(activeSession.breakEvents || []);
    const activeBreak = events.find((event) => event.status === BREAK_STATUS.ACTIVE);
    if (!activeBreak) return;
    if (timedBreakState.breakId === activeBreak.id && timedBreakState.phase !== BREAK_PHASE.IDLE) return;

    if (activeBreak.decisionStartedAt) {
      const timeout = window.setTimeout(() => {
        setTimedBreakState({
          ...createIdleBreakState(),
          phase: BREAK_PHASE.COMPLETE_DECISION,
          breakId: activeBreak.id,
          plannedStartElapsedMs: activeBreak.plannedStartElapsedMs,
          baseDurationMs: activeBreak.baseDurationMs || activeSession.sessionPlan?.breakDurationMs || 0,
          extensionCount: activeBreak.extensionCount || 0,
          decisionStartedAt: activeBreak.decisionStartedAt,
          decisionElapsedMs: Math.max(0, Date.now() - Date.parse(activeBreak.decisionStartedAt)),
        });
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    if (activeBreak.activeSegmentStartedAt) {
      const remainingMs = Math.max(
        0,
        Date.parse(activeBreak.activeSegmentStartedAt) + (activeBreak.activeSegmentDurationMs || activeBreak.baseDurationMs || 0) - Date.now()
      );
      const timeout = window.setTimeout(() => {
        setIsMonitoring(false);
        monitoringRef.current = false;
        clearCameraStream();
        resetTransientInferenceState();
        setTimedBreakState({
          ...createIdleBreakState(),
          phase: BREAK_PHASE.ACTIVE,
          breakId: activeBreak.id,
          plannedStartElapsedMs: activeBreak.plannedStartElapsedMs,
          baseDurationMs: activeBreak.baseDurationMs || activeSession.sessionPlan?.breakDurationMs || 0,
          extensionCount: activeBreak.extensionCount || 0,
          activeSegmentStartedAt: activeBreak.activeSegmentStartedAt,
          activeSegmentDurationMs: activeBreak.activeSegmentDurationMs || activeBreak.baseDurationMs || 0,
          remainingMs,
        });
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activeSession, clearCameraStream, resetTransientInferenceState, stopAllSessionAudio, timedBreakState.breakId, timedBreakState.phase]);

  useEffect(() => {
    Object.values(audioElementsRef.current).forEach((audio) => {
      audio.volume = sessionAudioState.muted ? 0 : sessionAudioState.volume;
    });

    if (sessionAudioState.muted) {
      stopAllSessionAudio();
      return;
    }

    const isStudyAudioAllowed =
      isFocusSpaceActive &&
      activeSession?.status === SESSION_STATUS.ACTIVE &&
      sessionClock.isRunning &&
      ![BREAK_PHASE.READY, BREAK_PHASE.SKIP_CONFIRMATION, BREAK_PHASE.ACTIVE, BREAK_PHASE.END_EARLY_CONFIRMATION, BREAK_PHASE.COMPLETE_DECISION].includes(timedBreakState.phase);

    if (timedBreakState.phase === BREAK_PHASE.ACTIVE) {
      stopAudio("study");
      stopAudio("shortAlarm");
      stopAudio("longAlarm");
      playSessionAudio("break", { loop: true, restart: false });
    } else if (isStudyAudioAllowed) {
      stopAudio("break");
      playSessionAudio("study", { loop: true, restart: false });
    } else {
      stopAudio("study");
      if (timedBreakState.phase !== BREAK_PHASE.COMPLETE_DECISION) stopAudio("longAlarm");
      if (timedBreakState.phase !== BREAK_PHASE.READY) stopAudio("shortAlarm");
      if (timedBreakState.phase !== BREAK_PHASE.ACTIVE) stopAudio("break");
    }
  }, [
    activeSession?.status,
    isFocusSpaceActive,
    playSessionAudio,
    sessionAudioState,
    sessionClock.isRunning,
    stopAllSessionAudio,
    stopAudio,
    timedBreakState.phase,
  ]);

  const toggleMonitoring = useCallback(async () => {
    if (monitoringRef.current) {
      return pauseSession();
    }

    const active = activeSessionRef.current;
    if (active?.status === SESSION_STATUS.PREPARED) {
      return activatePreparedSession();
    }
    if (active?.status === SESSION_STATUS.PAUSED) {
      return resumeSession();
    }
    if (active?.status === SESSION_STATUS.ACTIVE) {
      if (!cameraAllowedRef.current || !streamRef.current) {
        setShowCameraDialog(true);
        return null;
      }
      startSessionClock();
      resetEstimatorSession(latestAttentionRef.current, latestFatigueRef.current);
      setIsMonitoring(true);
      monitoringRef.current = true;
      addLog("Monitoring enabled for the active study session.", "success");
      return active;
    }

    return null;
  }, [activatePreparedSession, addLog, pauseSession, resetEstimatorSession, resumeSession, startSessionClock]);
  // Reset metrics and clear local session data
  const resetMetrics = useCallback(async () => {
    setIsMonitoring(false);
    stopAllSessionAudio();
    setTimedBreakState(createIdleBreakState());
    clearCameraStream();
    resetTransientInferenceState();
    setAttention(80);
    setFatigue(10);
    clearAllDebugMetricOverrides();
    resetDebugSimulation();
    sensitiveDebugPreviewRef.current = false;
    setIsSensitiveDebugPreviewEnabledState(false);
    setYawnCount(0);
    setBlinkRate(12);
    setEyeOpenness(1.0);
    setHeadPose({ yaw: 0, pitch: 0, roll: 0 });
    setCurrentGesture("None");
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);
    setTelemetryTable([]);
    setRawLandmarksHistory([]);
    resetEstimatorSession(80, 10);
    resetAffectState();
    resetSessionClock();
    setCheckpointStatus({
      state: "idle",
      lastAttemptedAt: null,
      lastCommittedAt: null,
      reason: null,
      error: null,
    });
    setRecoveryPromptDismissedSessionId(null);
    await sessionRuntimeRef.current.clear();
    syncSessionState();
    addLog("Metrics and session data reset to baseline.", "info");
  }, [
    addLog,
    clearAllDebugMetricOverrides,
    clearCameraStream,
    resetAffectState,
    resetDebugSimulation,
    resetEstimatorSession,
    resetSessionClock,
    resetTransientInferenceState,
    stopAllSessionAudio,
    syncSessionState,
  ]);
  const sessionValue = useMemo(() => ({
    sessionClock,
    getSessionElapsedMs,
    activeSession,
    completedSessions,
    activeSessionSamples,
    sessionRepositoryKind,
    checkpointStatus,
    prepareSession,
    activatePreparedSession,
    startSession,
    pauseSession,
    resumeSession,
    returnToRecoveredSession,
    finishSession,
    discardSession,
    updateSessionTask,
    updateTargetDuration,
    getSessionById,
    getMetricSamples,
    resetMetrics,
    setFocusSpaceActive: setIsFocusSpaceActive,
    timedBreak: {
      ...timedBreakState,
      isBreakMode: isBreakModePhase(timedBreakState.phase),
      isBlocking: isBreakBlockingPhase(timedBreakState.phase),
      formattedRemaining: formatCountdown(timedBreakState.remainingMs),
      formattedDecisionRemaining: formatCountdown(Math.max(0, BREAK_DECISION_WAIT_MS - timedBreakState.decisionElapsedMs)),
    },
    timedBreakActions: {
      startReadyBreak,
      requestSkipBreak,
      cancelSkipBreak,
      confirmSkipBreak,
      requestEndBreakEarly,
      cancelEndBreakEarly,
      confirmEndBreakEarly,
      continueStudyAfterBreak,
      extendBreak,
    },
    sessionAudio: {
      ...sessionAudioState,
      assets: AUDIO_ASSETS,
      setVolume: setSessionAudioVolume,
      setMuted: setSessionAudioMuted,
      enableAudio: enableSessionAudio,
    },
    isRecoveryPromptOpen: activeSession?.recoveryPending === true &&
      recoveryPromptDismissedSessionId !== activeSession.id,
  }), [
    activeSession,
    activeSessionSamples,
    activatePreparedSession,
    checkpointStatus,
    completedSessions,
    discardSession,
    finishSession,
    getMetricSamples,
    getSessionById,
    getSessionElapsedMs,
    pauseSession,
    prepareSession,
    recoveryPromptDismissedSessionId,
    resetMetrics,
    resumeSession,
    returnToRecoveredSession,
    sessionClock,
    sessionAudioState,
    sessionRepositoryKind,
    setSessionAudioMuted,
    setSessionAudioVolume,
    startSession,
    startReadyBreak,
    requestSkipBreak,
    cancelSkipBreak,
    confirmSkipBreak,
    requestEndBreakEarly,
    cancelEndBreakEarly,
    confirmEndBreakEarly,
    continueStudyAfterBreak,
    enableSessionAudio,
    extendBreak,
    timedBreakState,
    updateSessionTask,
    updateTargetDuration,
  ]);

  const monitoringValue = useMemo(() => ({
    isMonitoring,
    setIsMonitoring,
    isCameraAllowed,
    setIsCameraAllowed,
    cameraStatus,
    showCameraDialog,
    setShowCameraDialog,
    cameraStream,
    startCamera,
    stopCamera,
    toggleMonitoring,
    attention,
    fatigue,
    affectState,
    updateAffectMetrics,
    resetAffectState,
    affectModelStatus,
    setAffectModelStatus,
    blinkRate,
    setBlinkRate,
    yawnCount,
    setYawnCount,
    headPose,
    setHeadPose,
    currentGesture,
    setCurrentGesture,
    fps,
    latency,
    isAiLoaded,
    aiLoadingProgress,
    aiError,
    inferenceFps,
    setInferenceFps,
    faceLandmarkerStatus,
    gestureRecognizerStatus,
    eyeOpenness,
    setEyeOpenness,
    hasDetectedFace,
    setHasDetectedFace,
    hasDetectedHand,
    runtimeStatus,
    setRuntimeStatus,
    monitoringDetectionsRef,
    runtimeFaceCropCanvasRef,
    faceLandmarkerRef,
    gestureRecognizerRef,
    updateAiMetrics,
  }), [
    affectModelStatus,
    affectState,
    aiError,
    aiLoadingProgress,
    attention,
    blinkRate,
    cameraStatus,
    cameraStream,
    currentGesture,
    eyeOpenness,
    faceLandmarkerStatus,
    fatigue,
    fps,
    gestureRecognizerStatus,
    hasDetectedFace,
    hasDetectedHand,
    headPose,
    inferenceFps,
    isAiLoaded,
    isCameraAllowed,
    isMonitoring,
    latency,
    resetAffectState,
    runtimeStatus,
    showCameraDialog,
    startCamera,
    stopCamera,
    toggleMonitoring,
    updateAffectMetrics,
    updateAiMetrics,
    yawnCount,
  ]);

  const debugValue = useMemo(() => ({
    isDebugMode,
    setIsDebugMode,
    resolvedDebugMetrics,
    setDebugMetricOverride,
    clearDebugMetricOverride,
    clearAllDebugMetricOverrides,
    debugLiveMetrics,
    debugDisplayMetrics,
    debugSimulation,
    debugDiagnosticSnapshot,
    setDebugSimulationEnabled,
    setDebugSimulationMetric,
    applyDebugSimulationPreset: applyDebugSimulationPresetById,
    resetDebugSimulation,
    isSensitiveDebugPreviewEnabled,
    setSensitiveDebugPreviewEnabled,
    eventLog,
    addLog,
    clearEventLog,
    telemetryTable,
    rawLandmarksHistory,
    exportTelemetryCSV,
  }), [
    addLog,
    applyDebugSimulationPresetById,
    clearAllDebugMetricOverrides,
    clearDebugMetricOverride,
    clearEventLog,
    debugDiagnosticSnapshot,
    debugDisplayMetrics,
    debugLiveMetrics,
    debugSimulation,
    eventLog,
    exportTelemetryCSV,
    isDebugMode,
    isSensitiveDebugPreviewEnabled,
    rawLandmarksHistory,
    resetDebugSimulation,
    resolvedDebugMetrics,
    setDebugMetricOverride,
    setDebugSimulationEnabled,
    setDebugSimulationMetric,
    setIsDebugMode,
    setSensitiveDebugPreviewEnabled,
    telemetryTable,
  ]);

  return (
    <SessionContext.Provider value={sessionValue}>
      <MonitoringContext.Provider value={monitoringValue}>
        <DebugContext.Provider value={debugValue}>
          {children}
          <TimedBreakWarning state={timedBreakState} />
          <TimedBreakDialog state={timedBreakState} actions={sessionValue.timedBreakActions} />
        </DebugContext.Provider>
      </MonitoringContext.Provider>
    </SessionContext.Provider>
  );
};
