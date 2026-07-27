export const SESSION_SCHEMA_VERSION = "session-schema-v4";
export const SESSION_SUMMARY_ALGORITHM_VERSION = "session-summary-v2";
export const METRIC_AGGREGATION_VERSION = "metric-aggregation-v1";
export const DEFAULT_PIPELINE_VERSION = "browser-ai-pipeline-v1";
export const DEFAULT_SAMPLE_INTERVAL_MS = 5000;
export const DEFAULT_MINIMUM_DATA_COVERAGE = 0.6;
export const MIN_BREAK_FOCUS_DURATION_MS = 25 * 60000;
export const MAX_BREAK_FOCUS_DURATION_MS = 90 * 60000;
export const MIN_BREAK_DURATION_MS = 5 * 60000;
export const MAX_BREAK_DURATION_MS = 15 * 60000;
export const BREAK_DURATION_STEP_MS = 5 * 60000;
export const PRE_BREAK_WARNING_MS = 3 * 60000;
export const BREAK_EXTENSION_MS = 3 * 60000;
export const BREAK_DECISION_WAIT_MS = 2 * 60000;
export const BREAK_DECISION_ALARM_REPLAY_MS = 60 * 1000;
export const MAX_BREAK_EXTENSION_COUNT = 3;

export const SESSION_STATUS = Object.freeze({
  IDLE: "idle",
  PREPARED: "prepared",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  DISCARDED: "discarded",
});

export const BREAK_STATUS = Object.freeze({
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  COMPLETED: "completed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
});

export const INTERRUPTION_REASON = Object.freeze({
  MANUAL_PAUSE: "manual-pause",
  PAGE_HIDDEN: "page-hidden",
  CAMERA_LOST: "camera-lost",
});

export const DATA_QUALITY = Object.freeze({
  GOOD: "good",
  PARTIAL: "partial",
  INSUFFICIENT: "insufficient",
});

export const SUMMARY_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
  INSUFFICIENT: "insufficient",
});

export const METRIC_TREND = Object.freeze({
  INCREASING: "increasing",
  DECREASING: "decreasing",
  STABLE: "stable",
  INSUFFICIENT: "insufficient",
});

export const EMOTION_LABELS = Object.freeze([
  "Neutral",
  "Happiness",
  "Sadness",
  "Surprise",
  "Fear",
  "Disgust",
  "Anger",
  "Contempt",
]);

export const DEFAULT_DATA_QUALITY_THRESHOLDS = Object.freeze({
  good: 0.8,
  partial: 0.5,
});

// Provisional display/trend thresholds only; not clinically or scientifically validated boundaries.
export const DEFAULT_METRIC_TREND_THRESHOLDS = Object.freeze({
  attention: 5,
  fatigue: 5,
  valence: 0.05,
  arousal: 0.05,
});
