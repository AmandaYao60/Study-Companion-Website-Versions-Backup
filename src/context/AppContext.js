"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

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
const LONG_CLOSURE_MS = 1200;
const BLINK_MIN_MS = 80;
const BLINK_MAX_MS = 450;
const BLINK_BASELINE_MIN_MS = 30000;

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

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
  const [isDebugMode, setIsDebugMode] = useState(false);
  
  // Monitoring & Camera States
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraAllowed, setIsCameraAllowed] = useState(false);
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
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
  
  // Real-time table logging data
  const [telemetryTable, setTelemetryTable] = useState([]);
  const [rawLandmarksHistory, setRawLandmarksHistory] = useState([]);
  const [eyeOpenness, setEyeOpenness] = useState(1.0);

  const faceLandmarkerRef = useRef(null);
  const gestureRecognizerRef = useRef(null);
  const previousGestureRef = useRef("None");
  const isAiInitializingRef = useRef(false);

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
  const attentionEstimateRef = useRef(85);
  const fatigueEstimateRef = useRef(15);
  const latestFocusRef = useRef(85);
  const latestFatigueRef = useRef(15);
  const debugModeRef = useRef(false);

  // Affect smoothing state
  const smoothedValenceRef = useRef(null);
  const smoothedArousalRef = useRef(null);

  // Mental States (0 - 100)
  const [focus, setFocus] = useState(85);
  const [stress, setStress] = useState(30);
  const [fatigue, setFatigue] = useState(15);
  const [arousal, setArousal] = useState(45);

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
  const [eventLog, setEventLog] = useState([
    { id: 1, time: "10:40:15", message: "AI CV Model loaded successfully.", type: "info" },
    { id: 2, time: "10:40:16", message: "Calibration complete. Baseline established.", type: "info" }
  ]);

  // Historical data for charts (stores last 20 data points, taken every 3 seconds)
  const [metricsHistory, setMetricsHistory] = useState([]);

  const streamRef = useRef(null);
  const sessionClockRef = useRef(sessionClock);

  useEffect(() => {
    sessionClockRef.current = sessionClock;
  }, [sessionClock]);

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

  const pauseSessionClock = useCallback(() => {
    setSessionClock((previous) => {
      if (!previous.isRunning || !previous.runningSince) return previous;
      return {
        accumulatedMs: previous.accumulatedMs + Date.now() - previous.runningSince,
        runningSince: null,
        isRunning: false,
      };
    });
  }, []);

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
    const time = new Date().toTimeString().split(" ")[0];
    setEventLog((prev) => [
      { id: Date.now(), time, message, type },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  }, []);

  useEffect(() => {
    latestFocusRef.current = focus;
  }, [focus]);

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
    resetEstimatorSession(latestFocusRef.current, latestFatigueRef.current);
  }, [isMonitoring, resetEstimatorSession]);

  // AI Web-SDK loaders and updates
  const loadAiModels = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isAiLoaded || isAiInitializingRef.current) return;
    isAiInitializingRef.current = true;
    setAiError(null);
    setAiLoadingProgress(10);
    addLog("Loading AI Models resolver...", "info");
    
    try {
      const { FilesetResolver, FaceLandmarker, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      
      setAiLoadingProgress(30);
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );
      
      setAiLoadingProgress(50);
      addLog("Initializing Face Landmarker...", "info");
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO"
      });
      
      setAiLoadingProgress(80);
      addLog("Initializing Gesture Recognizer...", "info");
      gestureRecognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
      
      setAiLoadingProgress(100);
      setIsAiLoaded(true);
      addLog("AI Web-SDK models loaded successfully.", "success");
    } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("AI Model Loading Error:", err);
    setAiError(errorMessage);
    setAiLoadingProgress(0);
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

    setAffectState({
      valence: nextValence,
      arousal: nextArousal,
      emotion: typeof result.emotion === "string" ? result.emotion : null,
      confidence: Number.isFinite(result.confidence) ? result.confidence : null,
      valid: true,
      source: result.source ?? "browser-onnx",
      updatedAt: Date.now(),
      latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : null,
    });
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
  }, []);

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

    const frameLandmarks = {
      timestamp,
      face: [],
      hand: []
    };

    const faceDetected = faceResults?.faceLandmarks?.length > 0;

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
        setFocus(Math.round(attentionEstimateRef.current));
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
    if (isMonitoring) {
      setTelemetryTable((prev) => [tableRow, ...prev.slice(0, 49)]);
      setRawLandmarksHistory((prev) => [frameLandmarks, ...prev.slice(0, 49)]);
    }
  }, [isMonitoring, addLog]);

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

  // Camera WebRTC Handlers
  const startCamera = async () => {
    try {
      if (cameraStream) return true;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false
      });
      
      setCameraStream(stream);
      streamRef.current = stream;
      setIsCameraAllowed(true);
      addLog("Camera access granted. Live stream connected.", "success");
      return true;
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setIsCameraAllowed(false);
      addLog("Camera access denied or unavailable.", "error");
      throw err;
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    setIsCameraAllowed(false);
    setIsMonitoring(false);
    resetSessionClock();
    resetAffectState();
    setAffectModelStatus("idle");
    addLog("Camera stream stopped.", "info");
  };

  // Toggle Monitoring
  const toggleMonitoring = async () => {
    if (!isMonitoring) {
      // Starting
      if (!isCameraAllowed) {
        setShowCameraDialog(true);
      } else {
        setIsMonitoring(true);
        startSessionClock();
        addLog("Mental state monitoring started.", "success");
      }
    } else {
      // Pausing
      setIsMonitoring(false);
      pauseSessionClock();
      addLog("Mental state monitoring paused.", "warning");
    }
  };

  // Reset metrics
  const resetMetrics = () => {
    setFocus(80);
    setStress(25);
    setFatigue(10);
    setArousal(45);
    setYawnCount(0);
    setBlinkRate(12);
    setEyeOpenness(1.0);
    setHeadPose({ yaw: 0, pitch: 0, roll: 0 });
    setCurrentGesture("None");
    setMetricsHistory([]);
    setTelemetryTable([]);
    setRawLandmarksHistory([]);
    resetEstimatorSession(80, 10);
    resetAffectState();
    resetSessionClock();
    addLog("Metrics reset to baseline.", "info");
  };

  // Initialize metrics history with some starting points
  useEffect(() => {
    const initialHistory = [];
    const now = Date.now();
    for (let i = 19; i >= 0; i--) {
      initialHistory.push({
        timestamp: new Date(now - i * 3000).toLocaleTimeString().split(" ")[0],
        focus: Math.max(60, Math.min(95, 80 + Math.sin(i * 0.5) * 10 + (Math.random() - 0.5) * 5)),
        stress: Math.max(15, Math.min(60, 30 + Math.cos(i * 0.5) * 8 + (Math.random() - 0.5) * 4)),
        fatigue: Math.max(5, Math.min(30, 15 - i * 0.5 + (Math.random() - 0.5) * 3)),
        arousal: Math.max(30, Math.min(70, 45 + Math.sin(i * 0.3) * 5 + (Math.random() - 0.5) * 3))
      });
    }
    const timer = setTimeout(() => {
      setMetricsHistory(initialHistory);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Background Simulation Loop (only when monitoring is active)
  useEffect(() => {
    if (!isMonitoring) return;

    // Fall back to simulation only if camera tracking is offline or models not loaded
    if (isCameraAllowed && isAiLoaded) return;

    const interval = setInterval(() => {
      // 1. Update general mental states with small random walk
      setFocus((prev) => {
        const delta = (Math.random() - 0.5) * 4;
        return Math.max(10, Math.min(100, Math.round(prev + delta)));
      });
      setStress((prev) => {
        const delta = (Math.random() - 0.48) * 4; // slight upward drift if working
        return Math.max(5, Math.min(100, Math.round(prev + delta)));
      });
      setFatigue((prev) => {
        const delta = (Math.random() - 0.45) * 2; // slow accumulation
        return Math.max(0, Math.min(100, Math.round(prev + delta)));
      });
      setArousal((prev) => {
        const delta = (Math.random() - 0.5) * 3;
        return Math.max(10, Math.min(100, Math.round(prev + delta)));
      });

      // Update FPS and latency slightly for realism
      setFps(() => Math.round(29 + Math.random() * 2));
      setLatency(() => Math.round(15 + Math.random() * 6));

      // 2. Roll for random CV events
      const roll = Math.random();

      if (roll < 0.12) {
        // Blink Event
        setBlinkRate((prev) => Math.max(8, Math.min(24, prev + (Math.random() > 0.5 ? 1 : -1))));
        addLog("Blink detected.", "debug");
      } else if (roll < 0.15) {
        // Head Pose Adjustment
        const newYaw = parseFloat(((Math.random() - 0.5) * 15).toFixed(1));
        const newPitch = parseFloat(((Math.random() - 0.5) * 10).toFixed(1));
        const newRoll = parseFloat(((Math.random() - 0.5) * 5).toFixed(1));
        setHeadPose({ yaw: newYaw, pitch: newPitch, roll: newRoll });
        addLog(`Head pose updated (Yaw: ${newYaw}°, Pitch: ${newPitch}°)`, "debug");
      } else if (roll < 0.17) {
        // Gesture Event
        const gestures = ["Hand on Chin", "Leaning Forward", "Resting Head", "Rubbing Eyes", "None"];
        const newGesture = gestures[Math.floor(Math.random() * gestures.length)];
        setCurrentGesture(newGesture);
        
        if (newGesture !== "None") {
          addLog(`Gesture detected: ${newGesture}`, "info");
          if (newGesture === "Resting Head") {
            setFatigue((prev) => Math.min(100, prev + 5));
            setFocus((prev) => Math.max(0, prev - 10));
          } else if (newGesture === "Leaning Forward") {
            setFocus((prev) => Math.min(100, prev + 8));
          } else if (newGesture === "Rubbing Eyes") {
            setFatigue((prev) => Math.min(100, prev + 8));
            setStress((prev) => Math.min(100, prev + 4));
          }
        }
      } else if (roll < 0.185) {
        // Yawn Event
        setYawnCount((prev) => prev + 1);
        setFatigue((prev) => Math.min(100, prev + 12));
        setFocus((prev) => Math.max(0, prev - 15));
        addLog("Yawn detected. Fatigue level spiked.", "warning");
      }

    }, 2000);

    return () => clearInterval(interval);
  }, [isMonitoring, isCameraAllowed, isAiLoaded, addLog]);

  // Log history points every 5 seconds when monitoring is active
  useEffect(() => {
    if (!isMonitoring) return;

    const historyInterval = setInterval(() => {
      const timeStr = new Date().toLocaleTimeString().split(" ")[0];
      setMetricsHistory((prev) => {
        const next = [
          ...prev,
          {
            timestamp: timeStr,
            focus,
            stress,
            fatigue,
            arousal
          }
        ];
        return next.slice(-20); // Keep last 20 points
      });
    }, 4000);

    return () => clearInterval(historyInterval);
  }, [isMonitoring, focus, stress, fatigue, arousal]);

  return (
    <AppContext.Provider
      value={{
        isDebugMode,
        setIsDebugMode,
        isMonitoring,
        setIsMonitoring,
        isCameraAllowed,
        setIsCameraAllowed,
        showCameraDialog,
        setShowCameraDialog,
        cameraStream,
        startCamera,
        stopCamera,
        toggleMonitoring,
        resetMetrics,
        sessionClock,
        getSessionElapsedMs,
        focus,
        setFocus,
        stress,
        setStress,
        fatigue,
        setFatigue,
        arousal,
        setArousal,
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
        metricsHistory,
        
        // AI Web-SDK additions
        isAiLoaded,
        aiLoadingProgress,
        aiError,
        inferenceFps,
        setInferenceFps,
        telemetryTable,
        setTelemetryTable,
        rawLandmarksHistory,
        setRawLandmarksHistory,
        eyeOpenness,
        setEyeOpenness,
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
