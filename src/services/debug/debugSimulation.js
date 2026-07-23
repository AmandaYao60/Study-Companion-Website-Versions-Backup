import { DATA_QUALITY, EMOTION_LABELS } from "../session/sessionConstants.js";

export const DEBUG_SIMULATION_MODE = Object.freeze({
  LIVE: "live",
  SIMULATION: "simulation",
});

const DATA_QUALITY_VALUES = Object.freeze([
  DATA_QUALITY.GOOD,
  DATA_QUALITY.PARTIAL,
  DATA_QUALITY.INSUFFICIENT,
]);

const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const clampPercent = (value, fallback) => Math.round(clamp(value, 0, 100, fallback));
const clampUnit = (value, fallback) => Number(clamp(value, -1, 1, fallback).toFixed(2));
const clampConfidence = (value, fallback) => Number(clamp(value, 0, 1, fallback).toFixed(2));

export const DEFAULT_DEBUG_SIMULATION_METRICS = Object.freeze({
  attention: 72,
  fatigue: 22,
  valence: 0,
  arousal: 0,
  emotion: "Neutral",
  emotionConfidence: 0.65,
  faceDetected: true,
  dataQuality: DATA_QUALITY.GOOD,
});

export const DEBUG_SIMULATION_PRESETS = Object.freeze({
  focused: {
    label: "Focused",
    metrics: {
      attention: 88,
      fatigue: 12,
      valence: 0.35,
      arousal: 0.22,
      emotion: "Neutral",
      emotionConfidence: 0.72,
      faceDetected: true,
      dataQuality: DATA_QUALITY.GOOD,
    },
  },
  distracted: {
    label: "Distracted",
    metrics: {
      attention: 34,
      fatigue: 35,
      valence: -0.08,
      arousal: 0.35,
      emotion: "Surprise",
      emotionConfidence: 0.58,
      faceDetected: true,
      dataQuality: DATA_QUALITY.PARTIAL,
    },
  },
  fatigued: {
    label: "Fatigued",
    metrics: {
      attention: 46,
      fatigue: 82,
      valence: -0.22,
      arousal: -0.18,
      emotion: "Sadness",
      emotionConfidence: 0.64,
      faceDetected: true,
      dataQuality: DATA_QUALITY.PARTIAL,
    },
  },
  calm: {
    label: "Calm",
    metrics: {
      attention: 76,
      fatigue: 24,
      valence: 0.18,
      arousal: -0.45,
      emotion: "Neutral",
      emotionConfidence: 0.7,
      faceDetected: true,
      dataQuality: DATA_QUALITY.GOOD,
    },
  },
  stressed: {
    label: "Stressed",
    metrics: {
      attention: 48,
      fatigue: 45,
      valence: -0.35,
      arousal: 0.72,
      emotion: "Fear",
      emotionConfidence: 0.62,
      faceDetected: true,
      dataQuality: DATA_QUALITY.PARTIAL,
    },
  },
  positive: {
    label: "Positive",
    metrics: {
      attention: 80,
      fatigue: 18,
      valence: 0.68,
      arousal: 0.3,
      emotion: "Happiness",
      emotionConfidence: 0.78,
      faceDetected: true,
      dataQuality: DATA_QUALITY.GOOD,
    },
  },
  noFace: {
    label: "No Face",
    metrics: {
      attention: 20,
      fatigue: 15,
      valence: 0,
      arousal: 0,
      emotion: null,
      emotionConfidence: null,
      faceDetected: false,
      dataQuality: DATA_QUALITY.INSUFFICIENT,
    },
  },
  invalidData: {
    label: "Invalid Data",
    metrics: {
      attention: 0,
      fatigue: 0,
      valence: null,
      arousal: null,
      emotion: null,
      emotionConfidence: null,
      faceDetected: false,
      dataQuality: DATA_QUALITY.INSUFFICIENT,
    },
  },
});

export const normalizeDebugSimulationMetrics = (input = {}) => {
  const fallback = DEFAULT_DEBUG_SIMULATION_METRICS;
  const emotion = EMOTION_LABELS.includes(input.emotion) ? input.emotion : fallback.emotion;
  const dataQuality = DATA_QUALITY_VALUES.includes(input.dataQuality)
    ? input.dataQuality
    : fallback.dataQuality;

  return {
    attention: clampPercent(input.attention, fallback.attention),
    fatigue: clampPercent(input.fatigue, fallback.fatigue),
    valence: input.valence === null ? null : clampUnit(input.valence, fallback.valence),
    arousal: input.arousal === null ? null : clampUnit(input.arousal, fallback.arousal),
    emotion: input.emotion === null ? null : emotion,
    emotionConfidence: input.emotionConfidence === null
      ? null
      : clampConfidence(input.emotionConfidence, fallback.emotionConfidence),
    faceDetected: input.faceDetected === false ? false : Boolean(input.faceDetected ?? fallback.faceDetected),
    dataQuality,
  };
};

export const createDefaultDebugSimulationState = () => ({
  enabled: false,
  metrics: normalizeDebugSimulationMetrics(DEFAULT_DEBUG_SIMULATION_METRICS),
});

export const updateDebugSimulationMetric = (state, metric, value) => {
  const previous = state || createDefaultDebugSimulationState();
  if (!Object.hasOwn(DEFAULT_DEBUG_SIMULATION_METRICS, metric)) return previous;

  return {
    ...previous,
    metrics: normalizeDebugSimulationMetrics({
      ...previous.metrics,
      [metric]: value,
    }),
  };
};

export const applyDebugSimulationPreset = (state, presetId) => {
  const preset = DEBUG_SIMULATION_PRESETS[presetId];
  if (!preset) return state || createDefaultDebugSimulationState();

  return {
    enabled: true,
    metrics: normalizeDebugSimulationMetrics(preset.metrics),
  };
};

const normalizeNullableMetric = (value, min, max) => (
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null
);

export const normalizeLiveDisplayMetrics = (liveMetrics = {}) => ({
  attention: normalizeNullableMetric(liveMetrics.attention, 0, 100),
  fatigue: normalizeNullableMetric(liveMetrics.fatigue, 0, 100),
  valence: normalizeNullableMetric(liveMetrics.valence, -1, 1),
  arousal: normalizeNullableMetric(liveMetrics.arousal, -1, 1),
  emotion: typeof liveMetrics.emotion === "string" && liveMetrics.emotion.length > 0
    ? liveMetrics.emotion
    : null,
  emotionConfidence: normalizeNullableMetric(liveMetrics.emotionConfidence, 0, 1),
  faceDetected: Boolean(liveMetrics.faceDetected),
  handDetected: Boolean(liveMetrics.handDetected),
  dataQuality: DATA_QUALITY_VALUES.includes(liveMetrics.dataQuality)
    ? liveMetrics.dataQuality
    : DATA_QUALITY.INSUFFICIENT,
  latestObservationAt: liveMetrics.latestObservationAt || null,
  latestSampleAt: liveMetrics.latestSampleAt || null,
});

export const selectDebugDisplayMetrics = (liveMetrics, simulationState) => {
  if (simulationState?.enabled) {
    return {
      mode: DEBUG_SIMULATION_MODE.SIMULATION,
      source: "simulated",
      isSimulated: true,
      metrics: normalizeDebugSimulationMetrics(simulationState.metrics),
    };
  }

  return {
    mode: DEBUG_SIMULATION_MODE.LIVE,
    source: "live",
    isSimulated: false,
    metrics: normalizeLiveDisplayMetrics(liveMetrics),
  };
};
