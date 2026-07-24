export const DIAGNOSTIC_SNAPSHOT_INTERVAL_MS = 1000;
export const DIAGNOSTIC_STALE_AFTER_MS = 5000;

export const DIAGNOSTIC_STATE = Object.freeze({
  VALID: "valid",
  IDLE: "idle",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
  COLLECTING_BASELINE: "collecting-baseline",
  INSUFFICIENT_FACE_COVERAGE: "insufficient-face-coverage",
  INSUFFICIENT_OBSERVATIONS: "insufficient-observations",
  MODEL_UNAVAILABLE: "model-unavailable",
});

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
};

const round = (value, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

const toTimestamp = (value) => {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getAgeMs = (updatedAt, now = Date.now()) => {
  const timestamp = toTimestamp(updatedAt);
  if (!timestamp || !Number.isFinite(now)) return null;
  return Math.max(0, now - timestamp);
};

export const getFreshnessState = (updatedAt, now = Date.now(), staleAfterMs = DIAGNOSTIC_STALE_AFTER_MS) => {
  const ageMs = getAgeMs(updatedAt, now);
  if (ageMs === null) {
    return { state: DIAGNOSTIC_STATE.UNAVAILABLE, ageMs: null };
  }
  if (ageMs > staleAfterMs) {
    return { state: DIAGNOSTIC_STATE.STALE, ageMs };
  }
  return { state: DIAGNOSTIC_STATE.VALID, ageMs };
};

export const getFaceDetectionDiagnosticState = ({
  isMonitoring,
  isCameraAllowed,
  isAiLoaded,
  hasDetectedFace,
  updatedAt,
  now = Date.now(),
}) => {
  if (!isMonitoring) return DIAGNOSTIC_STATE.IDLE;
  if (!isCameraAllowed || !isAiLoaded) return DIAGNOSTIC_STATE.UNAVAILABLE;

  const freshness = getFreshnessState(updatedAt, now);
  if (freshness.state === DIAGNOSTIC_STATE.STALE) return DIAGNOSTIC_STATE.STALE;
  if (freshness.state === DIAGNOSTIC_STATE.UNAVAILABLE) return DIAGNOSTIC_STATE.UNAVAILABLE;
  return hasDetectedFace ? "yes" : "no";
};

export const getEstimatorGateReason = ({
  isMonitoring,
  isCameraAllowed,
  isAiLoaded,
  eyeCalibrationReady,
  dataQualityRatio,
  totalSamples,
}) => {
  if (!isMonitoring) return DIAGNOSTIC_STATE.IDLE;
  if (!isCameraAllowed || !isAiLoaded) return DIAGNOSTIC_STATE.UNAVAILABLE;
  if (!Number.isFinite(totalSamples) || totalSamples <= 0) return DIAGNOSTIC_STATE.INSUFFICIENT_OBSERVATIONS;
  if (!eyeCalibrationReady) return DIAGNOSTIC_STATE.COLLECTING_BASELINE;
  if (!Number.isFinite(dataQualityRatio) || dataQualityRatio < 0.5) {
    return DIAGNOSTIC_STATE.INSUFFICIENT_FACE_COVERAGE;
  }
  return DIAGNOSTIC_STATE.VALID;
};

export const createDefaultDiagnosticSnapshot = () => ({
  updatedAt: null,
  attention: {
    value: null,
    raw: null,
    facePresenceScore: null,
    forwardPoseScore: null,
    headStabilityScore: null,
    status: DIAGNOSTIC_STATE.IDLE,
    gateReason: DIAGNOSTIC_STATE.IDLE,
    source: "heuristic",
    updatedAt: null,
  },
  fatigue: {
    value: null,
    raw: null,
    averageEAR: null,
    baselineEAR: null,
    calibrationStatus: DIAGNOSTIC_STATE.IDLE,
    calibrationElapsedMs: 0,
    calibrationTargetMs: 0,
    calibrationSampleCount: 0,
    calibrationMinimumSamples: 0,
    closedEyeRatio: null,
    perclosScore: null,
    longEyeClosureCount: 0,
    currentBlinkRate: null,
    baselineBlinkRate: null,
    blinkRateScore: null,
    status: DIAGNOSTIC_STATE.IDLE,
    gateReason: DIAGNOSTIC_STATE.IDLE,
    source: "heuristic",
    updatedAt: null,
  },
  affect: {
    rawValence: null,
    rawArousal: null,
    valence: null,
    arousal: null,
    topEmotionProbabilities: [],
    latencyMs: null,
    source: null,
    status: DIAGNOSTIC_STATE.UNAVAILABLE,
    updatedAt: null,
  },
  gesture: {
    detectedHandCount: 0,
    primaryGesture: null,
    primaryGestureScore: null,
    twoHandFrames: 0,
    status: DIAGNOSTIC_STATE.IDLE,
    updatedAt: null,
  },
  aggregation: {
    validFaceObservations: 0,
    totalObservations: 0,
    validAffectObservations: 0,
    expectedObservationCount: 0,
    acceptedObservationCount: 0,
    observationWindowCoverage: null,
    dataQuality: "insufficient",
    status: DIAGNOSTIC_STATE.IDLE,
  },
  performance: {
    targetInferenceFps: null,
    measuredProcessingFps: null,
    mediaPipeLatencyMs: null,
    affectLatencyMs: null,
    updatedAt: null,
  },
});

export const createEstimatorDiagnosticSnapshot = ({
  now = Date.now(),
  isMonitoring,
  isCameraAllowed,
  isAiLoaded,
  attention,
  fatigue,
  averageEAR,
  baselineEAR,
  calibrationElapsedMs,
  calibrationTargetMs,
  calibrationSampleCount,
  calibrationMinimumSamples,
  eyeCalibrationReady,
  facePresenceScore,
  forwardPoseScore,
  headStabilityScore,
  attentionRaw,
  closedEyeRatio,
  perclosScore,
  longEyeClosureCount,
  currentBlinkRate,
  baselineBlinkRate,
  blinkRateScore,
  fatigueRaw,
  dataQualityRatio,
  dataQuality,
  validFaceObservations,
  totalObservations,
  detectedHandCount,
  primaryGesture,
  primaryGestureScore,
  twoHandFrames,
  targetInferenceFps,
  measuredProcessingFps,
  mediaPipeLatencyMs,
  affectLatencyMs,
}) => {
  const gateReason = getEstimatorGateReason({
    isMonitoring,
    isCameraAllowed,
    isAiLoaded,
    eyeCalibrationReady,
    dataQualityRatio,
    totalSamples: totalObservations,
  });
  const valid = gateReason === DIAGNOSTIC_STATE.VALID;
  const calibrationStatus = !isMonitoring
    ? DIAGNOSTIC_STATE.IDLE
    : eyeCalibrationReady
      ? DIAGNOSTIC_STATE.VALID
      : DIAGNOSTIC_STATE.COLLECTING_BASELINE;

  return {
    ...createDefaultDiagnosticSnapshot(),
    updatedAt: now,
    attention: {
      value: valid ? clamp(attention, 0, 100) : null,
      raw: valid ? round(attentionRaw, 2) : null,
      facePresenceScore: round(facePresenceScore, 2),
      forwardPoseScore: round(forwardPoseScore, 2),
      headStabilityScore: round(headStabilityScore, 2),
      status: valid ? DIAGNOSTIC_STATE.VALID : gateReason,
      gateReason,
      source: "heuristic",
      updatedAt: now,
    },
    fatigue: {
      value: valid ? clamp(fatigue, 0, 100) : null,
      raw: valid ? round(fatigueRaw, 2) : null,
      averageEAR: round(averageEAR),
      baselineEAR: round(baselineEAR),
      calibrationStatus,
      calibrationElapsedMs: Math.max(0, Math.min(calibrationElapsedMs || 0, calibrationTargetMs || 0)),
      calibrationTargetMs: Math.max(0, calibrationTargetMs || 0),
      calibrationSampleCount: Math.max(0, calibrationSampleCount || 0),
      calibrationMinimumSamples: Math.max(0, calibrationMinimumSamples || 0),
      closedEyeRatio: round(closedEyeRatio),
      perclosScore: round(perclosScore, 2),
      longEyeClosureCount: Math.max(0, longEyeClosureCount || 0),
      currentBlinkRate: round(currentBlinkRate, 2),
      baselineBlinkRate: round(baselineBlinkRate, 2),
      blinkRateScore: round(blinkRateScore, 2),
      status: valid ? DIAGNOSTIC_STATE.VALID : gateReason,
      gateReason,
      source: "heuristic",
      updatedAt: now,
    },
    gesture: {
      detectedHandCount: Math.max(0, detectedHandCount || 0),
      primaryGesture: primaryGesture || null,
      primaryGestureScore: round(primaryGestureScore, 3),
      twoHandFrames: Math.max(0, twoHandFrames || 0),
      status: isMonitoring ? DIAGNOSTIC_STATE.VALID : DIAGNOSTIC_STATE.IDLE,
      updatedAt: now,
    },
    aggregation: {
      validFaceObservations: Math.max(0, validFaceObservations || 0),
      totalObservations: Math.max(0, totalObservations || 0),
      validAffectObservations: 0,
      expectedObservationCount: 0,
      acceptedObservationCount: 0,
      observationWindowCoverage: round(dataQualityRatio, 3),
      dataQuality: dataQuality || "insufficient",
      status: valid ? DIAGNOSTIC_STATE.VALID : gateReason,
    },
    performance: {
      targetInferenceFps: Number.isFinite(targetInferenceFps) ? targetInferenceFps : null,
      measuredProcessingFps: Number.isFinite(measuredProcessingFps) ? measuredProcessingFps : null,
      mediaPipeLatencyMs: Number.isFinite(mediaPipeLatencyMs) ? mediaPipeLatencyMs : null,
      affectLatencyMs: Number.isFinite(affectLatencyMs) ? affectLatencyMs : null,
      updatedAt: now,
    },
  };
};

export const mergeAffectDiagnostic = (snapshot, {
  rawValence,
  rawArousal,
  valence,
  arousal,
  topEmotionProbabilities,
  latencyMs,
  source,
  updatedAt = Date.now(),
}) => ({
  ...snapshot,
  affect: {
    rawValence: round(rawValence),
    rawArousal: round(rawArousal),
    valence: round(valence),
    arousal: round(arousal),
    topEmotionProbabilities: Array.isArray(topEmotionProbabilities)
      ? topEmotionProbabilities.slice(0, 3).map((item) => ({
        emotion: typeof item.emotion === "string" ? item.emotion : "Unknown",
        probability: clamp(item.probability, 0, 1),
      }))
      : [],
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : null,
    source: source || null,
    status: DIAGNOSTIC_STATE.VALID,
    updatedAt,
  },
  performance: {
    ...snapshot.performance,
    affectLatencyMs: Number.isFinite(latencyMs) ? latencyMs : snapshot.performance.affectLatencyMs,
  },
});

export const shouldClearSensitivePreview = (isDebugMode) => !isDebugMode;
