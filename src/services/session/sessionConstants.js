export const SESSION_SCHEMA_VERSION = "session-schema-v1";
export const SESSION_SUMMARY_ALGORITHM_VERSION = "session-summary-v1";
export const METRIC_AGGREGATION_VERSION = "metric-aggregation-v1";
export const DEFAULT_PIPELINE_VERSION = "browser-ai-pipeline-v1";
export const DEFAULT_SAMPLE_INTERVAL_MS = 10000;
export const DEFAULT_MINIMUM_DATA_COVERAGE = 0.6;

export const SESSION_STATUS = Object.freeze({
  IDLE: "idle",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  DISCARDED: "discarded",
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
