import {
  DATA_QUALITY,
  DEFAULT_DATA_QUALITY_THRESHOLDS,
  EMOTION_LABELS,
  METRIC_AGGREGATION_VERSION,
} from "./sessionConstants.js";
import { normalizeMetricObservation, normalizeMetricSample } from "./sessionSchema.js";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const validNumbers = (values) => values.filter(isFiniteNumber);
const mean = (values) => {
  const numbers = validNumbers(values);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};

/** Calculate valid-sample coverage from explicit counts. @param {number} validCount @param {number} expectedCount */
export const calculateDataCoverage = (validCount, expectedCount) => {
  if (!isFiniteNumber(validCount) || !isFiniteNumber(expectedCount) || expectedCount <= 0) return 0;
  return Math.min(1, Math.max(0, validCount / expectedCount));
};

/** Classify data quality with configurable thresholds. @param {number} dataCoverage @param {{good?:number,partial?:number}=} thresholds */
export const classifyDataQuality = (dataCoverage, thresholds = DEFAULT_DATA_QUALITY_THRESHOLDS) => {
  const good = isFiniteNumber(thresholds.good) ? thresholds.good : DEFAULT_DATA_QUALITY_THRESHOLDS.good;
  const partial = isFiniteNumber(thresholds.partial) ? thresholds.partial : DEFAULT_DATA_QUALITY_THRESHOLDS.partial;
  if (!isFiniteNumber(dataCoverage)) return DATA_QUALITY.INSUFFICIENT;
  if (dataCoverage >= good) return DATA_QUALITY.GOOD;
  if (dataCoverage >= partial) return DATA_QUALITY.PARTIAL;
  return DATA_QUALITY.INSUFFICIENT;
};

/** Select dominant valid EmotiEffLib category; ties use canonical label order. @param {Array<Object>} observations */
export const selectDominantEmotion = (observations = []) => {
  const counts = new Map();
  const confidences = new Map();
  observations.map(normalizeMetricObservation).forEach((observation) => {
    if (!observation.emotion || !EMOTION_LABELS.includes(observation.emotion)) return;
    counts.set(observation.emotion, (counts.get(observation.emotion) || 0) + 1);
    if (isFiniteNumber(observation.emotionConfidence)) {
      confidences.set(observation.emotion, [...(confidences.get(observation.emotion) || []), observation.emotionConfidence]);
    }
  });

  let emotion = null;
  let count = 0;
  EMOTION_LABELS.forEach((label) => {
    const nextCount = counts.get(label) || 0;
    if (nextCount > count) {
      emotion = label;
      count = nextCount;
    }
  });

  if (!emotion) return { emotion: null, emotionConfidence: null, count: 0 };
  return { emotion, emotionConfidence: mean(confidences.get(emotion) || []), count };
};

/**
 * Aggregate short-lived observations into a persisted interval sample without interpolation, previous-value substitution, or fabricated values.
 * @param {Array<Object>} observations
 * @param {Object} options
 * @returns {import("./sessionSchema.js").MetricSample}
 */
export const aggregateMetricObservations = (observations = [], options = {}) => {
  const normalized = observations.map(normalizeMetricObservation);
  const dataValidObservations = normalized.filter((observation) => observation.dataValid);
  const affectValidObservations = dataValidObservations.filter((observation) => observation.affectValid);
  const expectedObservationCount = isFiniteNumber(options.expectedObservationCount)
    ? Math.max(0, Math.floor(options.expectedObservationCount))
    : normalized.length;
  const validObservationCount = dataValidObservations.length;
  const affectObservationCount = affectValidObservations.length;
  const dataCoverage = calculateDataCoverage(validObservationCount, expectedObservationCount);
  const dominantEmotion = selectDominantEmotion(affectValidObservations);

  return normalizeMetricSample({
    id: options.sampleId,
    sessionId: options.sessionId,
    recordedAt: options.intervalEndedAt || new Date().toISOString(),
    intervalStartedAt: options.intervalStartedAt,
    intervalEndedAt: options.intervalEndedAt,
    elapsedMs: options.elapsedMs,
    attention: mean(dataValidObservations.map((observation) => observation.attention)),
    fatigue: mean(dataValidObservations.map((observation) => observation.fatigue)),
    valence: mean(affectValidObservations.map((observation) => observation.valence)),
    arousal: mean(affectValidObservations.map((observation) => observation.arousal)),
    emotion: dominantEmotion.emotion,
    emotionConfidence: dominantEmotion.emotionConfidence,
    validObservationCount,
    expectedObservationCount,
    affectObservationCount,
    dataCoverage,
    dataQuality: classifyDataQuality(dataCoverage, options.dataQualityThresholds),
    aggregationVersion: options.aggregationVersion || METRIC_AGGREGATION_VERSION,
  });
};
