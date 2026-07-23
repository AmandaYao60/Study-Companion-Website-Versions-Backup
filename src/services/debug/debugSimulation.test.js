import test from "node:test";
import assert from "node:assert/strict";

import { DATA_QUALITY } from "../session/sessionConstants.js";
import {
  DEBUG_SIMULATION_MODE,
  applyDebugSimulationPreset,
  createDefaultDebugSimulationState,
  normalizeDebugSimulationMetrics,
  selectDebugDisplayMetrics,
  updateDebugSimulationMetric,
} from "./debugSimulation.js";

test("debug simulation normalization clamps canonical metric ranges", () => {
  const normalized = normalizeDebugSimulationMetrics({
    attention: 140,
    fatigue: -20,
    valence: 5,
    arousal: -5,
    emotion: "NotReal",
    emotionConfidence: 4,
    faceDetected: false,
    dataQuality: "bad",
  });

  assert.equal(normalized.attention, 100);
  assert.equal(normalized.fatigue, 0);
  assert.equal(normalized.valence, 1);
  assert.equal(normalized.arousal, -1);
  assert.equal(normalized.emotion, "Neutral");
  assert.equal(normalized.emotionConfidence, 1);
  assert.equal(normalized.faceDetected, false);
  assert.equal(normalized.dataQuality, DATA_QUALITY.GOOD);
});

test("debug simulation presets enable simulation with normalized values", () => {
  const state = applyDebugSimulationPreset(createDefaultDebugSimulationState(), "stressed");

  assert.equal(state.enabled, true);
  assert.equal(state.metrics.emotion, "Fear");
  assert.equal(state.metrics.dataQuality, DATA_QUALITY.PARTIAL);
  assert.ok(state.metrics.arousal > 0);
});

test("debug display selector switches between live and simulated metrics without mutating live input", () => {
  const liveMetrics = {
    attention: 82,
    fatigue: 18,
    valence: 0.2,
    arousal: -0.1,
    emotion: "Neutral",
    emotionConfidence: 0.75,
    faceDetected: true,
    handDetected: false,
    dataQuality: DATA_QUALITY.GOOD,
  };

  const liveDisplay = selectDebugDisplayMetrics(liveMetrics, { enabled: false });
  assert.equal(liveDisplay.mode, DEBUG_SIMULATION_MODE.LIVE);
  assert.equal(liveDisplay.metrics.attention, 82);

  const simulationState = updateDebugSimulationMetric(
    { enabled: true, metrics: { ...liveMetrics } },
    "attention",
    15
  );
  const simulatedDisplay = selectDebugDisplayMetrics(liveMetrics, simulationState);

  assert.equal(simulatedDisplay.mode, DEBUG_SIMULATION_MODE.SIMULATION);
  assert.equal(simulatedDisplay.metrics.attention, 15);
  assert.equal(liveMetrics.attention, 82);
});
