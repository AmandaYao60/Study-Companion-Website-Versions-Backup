"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  createIndexedDbSessionRepository,
  createSessionRuntime,
  SESSION_STATUS,
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

const AppContext = createContext();
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

export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppProvider");
  }
  return context;
};

export const AppProvider = ({ children }) => {
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
  const lastLiveMetricAtRef = useRef(0);
  const liveMetricSequenceRef = useRef(0);

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

  // Historical data for charts (stores live points only; no random seed data)
  const [metricsHistory, setMetricsHistory] = useState([]);
  const [activeSessionLiveMetrics, setActiveSessionLiveMetrics] = useState([]);

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

  const streamRef = useRef(null);
  const sessionClockRef = useRef(sessionClock);
  const activeSessionRef = useRef(activeSession);
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
    };
  }, []);

  // Helper to add log messages
  const addLog = useCallback((message, type = "info") => {
    setEventLog((previous) => appendDebugLogMessage(previous, message, type));
  }, []);

  const clearEventLog = useCallback(() => {
    setEventLog([]);
  }, []);

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
    setIsSensitiveDebugPreviewEnabledState(Boolean(enabled));
  }, []);

  const setIsDebugMode = useCallback((nextValue) => {
    const resolvedValue = Boolean(
      typeof nextValue === "function" ? nextValue(debugModeRef.current) : nextValue
    );
    if (!resolvedValue) {
      setDebugMetricOverrides(createDefaultDebugMetricOverrides());
      setDebugSimulation(createDefaultDebugSimulationState());
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
    const latestLiveMetric = activeSessionLiveMetrics[activeSessionLiveMetrics.length - 1] || null;
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
      dataQuality: latestLiveMetric?.dataQuality || "insufficient",
      latestObservationAt: hasEstimatorSnapshot ? debugDiagnosticSnapshot.updatedAt : latestLiveMetric?.recordedAt || null,
      latestSampleAt: latestSample?.intervalEndedAt || latestSample?.recordedAt || null,
    };
  }, [activeSessionLiveMetrics, activeSessionSamples, affectState, debugDiagnosticSnapshot, hasDetectedFace, hasDetectedHand]);

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

    if (timestamp - lastLiveMetricAtRef.current >= ESTIMATOR_INTERVAL_MS) {
      lastLiveMetricAtRef.current = timestamp;
      liveMetricSequenceRef.current += 1;
      setActiveSessionLiveMetrics((previous) => [
        ...previous,
        {
          id: `${active.id}-live-${liveMetricSequenceRef.current}`,
          recordedAt,
          elapsedMs: observation.elapsedMs,
          attention: observation.attention,
          fatigue: observation.fatigue,
          valence: observation.valence,
          arousal: observation.arousal,
          emotion: observation.emotion,
          emotionConfidence: observation.emotionConfidence,
          dataQuality: dataValid ? "good" : faceDetected ? "partial" : "insufficient",
        },
      ]);
    }

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
    recordSessionObservation(timestamp, faceDetected);

    if (isMonitoring) {
      setTelemetryTable((prev) => [tableRow, ...prev.slice(0, 49)]);
      setRawLandmarksHistory((prev) => [frameLandmarks, ...prev.slice(0, 49)]);
    }
  }, [isMonitoring, inferenceFps, addLog, recordSessionObservation]);

  const exportTelemetryCSV = () => {
    if (rawLandmarksHistory.length === 0) {
      alert("No raw landmarks recorded yet. Start camera monitoring to capture data.");
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
  };

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
  }, [resetAffectState]);

  const prepareSession = useCallback(async ({ taskDescription = "", targetDurationMs = null, preSessionCheckIn = null } = {}) => {
    const existing = activeSessionRef.current;
    if (existing) {
      return existing;
    }

    setIsMonitoring(false);
    resetSessionClock();
    resetEstimatorSession(SESSION_START_BASELINE.attention, SESSION_START_BASELINE.fatigue);

    setActiveSessionLiveMetrics([]);
    lastLiveMetricAtRef.current = 0;
    liveMetricSequenceRef.current = 0;
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);

    const session = await sessionRuntimeRef.current.prepareSession({
      taskDescription,
      targetDurationMs,
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

  const finishSession = useCallback(async () => {
    if (!activeSessionRef.current) return null;

    const elapsedMs = getSessionElapsedMs();
    setIsMonitoring(false);

    const completed = await sessionRuntimeRef.current.finishSession(elapsedMs);
    clearCameraStream();
    resetTransientInferenceState();
    resetSessionClock();
    setMetricsHistory([]);
    setActiveSessionLiveMetrics([]);
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);
    setRecoveryPromptDismissedSessionId(null);
    syncSessionState();
    addLog("Study session finished and summarized.", "success");
    return completed;
  }, [addLog, clearCameraStream, getSessionElapsedMs, resetSessionClock, resetTransientInferenceState, syncSessionState]);

  const discardSession = useCallback(async () => {
    if (!activeSessionRef.current) return false;

    setIsMonitoring(false);
    clearCameraStream();
    resetTransientInferenceState();
    const discarded = await sessionRuntimeRef.current.discardSession();
    resetSessionClock();
    setMetricsHistory([]);
    setActiveSessionLiveMetrics([]);
    lastLiveMetricAtRef.current = 0;
    liveMetricSequenceRef.current = 0;
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    setHasDetectedHand(false);
    setRecoveryPromptDismissedSessionId(null);
    syncSessionState();
    addLog("Study session discarded.", "warning");
    return discarded;
  }, [addLog, clearCameraStream, resetSessionClock, resetTransientInferenceState, syncSessionState]);

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

  const toggleMonitoring = async () => {
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
  };
  // Reset metrics and clear local session data
  const resetMetrics = async () => {
    setIsMonitoring(false);
    clearCameraStream();
    resetTransientInferenceState();
    setAttention(80);
    setFatigue(10);
    clearAllDebugMetricOverrides();
    resetDebugSimulation();
    setIsSensitiveDebugPreviewEnabledState(false);
    setYawnCount(0);
    setBlinkRate(12);
    setEyeOpenness(1.0);
    setHeadPose({ yaw: 0, pitch: 0, roll: 0 });
    setCurrentGesture("None");
    setMetricsHistory([]);
    setActiveSessionLiveMetrics([]);
    lastLiveMetricAtRef.current = 0;
    liveMetricSequenceRef.current = 0;
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
  };
  return (
    <AppContext.Provider
      value={{
        isDebugMode,
        setIsDebugMode,
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
        resetMetrics,
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
        attention,
        fatigue,
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
        eventLog,
        addLog,
        clearEventLog,
        metricsHistory,
        activeSessionLiveMetrics,
        isRecoveryPromptOpen: activeSession?.recoveryPending === true &&
          recoveryPromptDismissedSessionId !== activeSession.id,
        
        // AI Web-SDK additions
        isAiLoaded,
        aiLoadingProgress,
        aiError,
        inferenceFps,
        setInferenceFps,
        faceLandmarkerStatus,
        gestureRecognizerStatus,
        telemetryTable,
        setTelemetryTable,
        rawLandmarksHistory,
        setRawLandmarksHistory,
        eyeOpenness,
        setEyeOpenness,
        hasDetectedFace,
        setHasDetectedFace,
        runtimeStatus,
        setRuntimeStatus,
        monitoringDetectionsRef,
        runtimeFaceCropCanvasRef,
        faceLandmarkerRef,
        gestureRecognizerRef,
        updateAiMetrics,
        exportTelemetryCSV
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
