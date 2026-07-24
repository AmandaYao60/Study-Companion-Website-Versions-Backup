import test from "node:test";
import assert from "node:assert/strict";

import {
  DIAGNOSTIC_STATE,
  createEstimatorDiagnosticSnapshot,
  getFaceDetectionDiagnosticState,
  getFreshnessState,
  mergeAffectDiagnostic,
  shouldClearSensitivePreview,
} from "./debugDiagnostics.js";

test("diagnostic freshness marks missing, valid, and stale values", () => {
  assert.deepEqual(getFreshnessState(null, 10_000), {
    state: DIAGNOSTIC_STATE.UNAVAILABLE,
    ageMs: null,
  });
  assert.deepEqual(getFreshnessState(8_000, 10_000), {
    state: DIAGNOSTIC_STATE.VALID,
    ageMs: 2_000,
  });
  assert.equal(getFreshnessState(1_000, 10_000).state, DIAGNOSTIC_STATE.STALE);
});

test("face detection state reflects monitoring, availability, and stale results", () => {
  assert.equal(getFaceDetectionDiagnosticState({
    isMonitoring: false,
    isCameraAllowed: true,
    isAiLoaded: true,
    hasDetectedFace: true,
    updatedAt: 1_000,
    now: 2_000,
  }), DIAGNOSTIC_STATE.IDLE);

  assert.equal(getFaceDetectionDiagnosticState({
    isMonitoring: true,
    isCameraAllowed: false,
    isAiLoaded: true,
    hasDetectedFace: true,
    updatedAt: 1_000,
    now: 2_000,
  }), DIAGNOSTIC_STATE.UNAVAILABLE);

  assert.equal(getFaceDetectionDiagnosticState({
    isMonitoring: true,
    isCameraAllowed: true,
    isAiLoaded: true,
    hasDetectedFace: false,
    updatedAt: 1_000,
    now: 2_000,
  }), "no");

  assert.equal(getFaceDetectionDiagnosticState({
    isMonitoring: true,
    isCameraAllowed: true,
    isAiLoaded: true,
    hasDetectedFace: true,
    updatedAt: 1_000,
    now: 8_000,
  }), DIAGNOSTIC_STATE.STALE);
});

test("estimator diagnostics do not expose placeholder attention or fatigue as valid", () => {
  const snapshot = createEstimatorDiagnosticSnapshot({
    now: 10_000,
    isMonitoring: false,
    isCameraAllowed: false,
    isAiLoaded: false,
    attention: 85,
    fatigue: 15,
    eyeCalibrationReady: false,
    totalObservations: 0,
  });

  assert.equal(snapshot.attention.value, null);
  assert.equal(snapshot.fatigue.value, null);
  assert.equal(snapshot.attention.status, DIAGNOSTIC_STATE.IDLE);
  assert.equal(snapshot.fatigue.status, DIAGNOSTIC_STATE.IDLE);
});

test("estimator diagnostics expose normalized valid intermediate values", () => {
  const snapshot = createEstimatorDiagnosticSnapshot({
    now: 10_000,
    isMonitoring: true,
    isCameraAllowed: true,
    isAiLoaded: true,
    attention: 72,
    fatigue: 28,
    averageEAR: 0.24,
    baselineEAR: 0.3,
    calibrationElapsedMs: 8_000,
    calibrationTargetMs: 8_000,
    calibrationSampleCount: 14,
    calibrationMinimumSamples: 12,
    eyeCalibrationReady: true,
    facePresenceScore: 86.2,
    forwardPoseScore: 81,
    headStabilityScore: 74,
    attentionRaw: 68.4,
    closedEyeRatio: 0.11,
    perclosScore: 24,
    longEyeClosureCount: 1,
    currentBlinkRate: 11,
    baselineBlinkRate: 12,
    blinkRateScore: 4,
    fatigueRaw: 22,
    dataQualityRatio: 0.86,
    dataQuality: "good",
    validFaceObservations: 43,
    totalObservations: 50,
    detectedHandCount: 1,
    primaryGesture: "Open_Palm",
    primaryGestureScore: 0.82,
    twoHandFrames: 0,
    targetInferenceFps: 5,
    mediaPipeLatencyMs: 18,
    affectLatencyMs: 35,
  });

  assert.equal(snapshot.attention.status, DIAGNOSTIC_STATE.VALID);
  assert.equal(snapshot.attention.value, 72);
  assert.equal(snapshot.fatigue.value, 28);
  assert.equal(snapshot.aggregation.validFaceObservations, 43);
  assert.equal(snapshot.performance.mediaPipeLatencyMs, 18);
  assert.equal(snapshot.performance.affectLatencyMs, 35);
});

test("affect diagnostics keep only top three probabilities and sensitive previews clear with Debug Mode", () => {
  const snapshot = mergeAffectDiagnostic(createEstimatorDiagnosticSnapshot({
    isMonitoring: false,
    totalObservations: 0,
  }), {
    rawValence: 0.2,
    rawArousal: -0.3,
    valence: 0.1,
    arousal: -0.1,
    topEmotionProbabilities: [
      { emotion: "Neutral", probability: 0.5 },
      { emotion: "Happiness", probability: 0.25 },
      { emotion: "Surprise", probability: 0.15 },
      { emotion: "Fear", probability: 0.1 },
    ],
    latencyMs: 42,
    source: "browser-onnx-wasm",
    updatedAt: 20_000,
  });

  assert.equal(snapshot.affect.topEmotionProbabilities.length, 3);
  assert.equal(snapshot.affect.latencyMs, 42);
  assert.equal(snapshot.performance.affectLatencyMs, 42);
  assert.equal(shouldClearSensitivePreview(false), true);
  assert.equal(shouldClearSensitivePreview(true), false);
});
