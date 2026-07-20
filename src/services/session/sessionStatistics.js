import { DATA_QUALITY, EMOTION_LABELS, METRIC_TREND } from "./sessionConstants.js";
import { normalizeMetricSample, normalizeStudySession } from "./sessionSchema.js";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const validNumbers = (values) => values.filter(isFiniteNumber);

/** @param {Array<number|null|undefined>} values */
export const calculateMean = (values = []) => {
  const numbers = validNumbers(values);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};

/** @param {Array<number|null|undefined>} values */
export const calculateMin = (values = []) => {
  const numbers = validNumbers(values);
  return numbers.length > 0 ? Math.min(...numbers) : null;
};

/** @param {Array<number|null|undefined>} values */
export const calculateMax = (values = []) => {
  const numbers = validNumbers(values);
  return numbers.length > 0 ? Math.max(...numbers) : null;
};

/** Population standard deviation for all interval samples in one completed session. @param {Array<number|null|undefined>} values */
export const calculateStandardDeviation = (values = []) => {
  const numbers = validNumbers(values);
  if (numbers.length === 0) return null;
  const average = calculateMean(numbers);
  const variance = numbers.reduce((sum, value) => sum + (value - average) ** 2, 0) / numbers.length;
  return Math.sqrt(variance);
};

const edgeMean = (values, portion) => {
  const numbers = validNumbers(values);
  if (numbers.length === 0) return { startMean: null, endMean: null };
  const edgeSize = Math.max(1, Math.ceil(numbers.length * portion));
  return { startMean: calculateMean(numbers.slice(0, edgeSize)), endMean: calculateMean(numbers.slice(-edgeSize)) };
};

/** @param {Array<number|null|undefined>} values @param {{edgePortion?:number,minTrendSampleCount?:number,meaningfulTrendChange?:number}=} options @returns {import("./sessionSchema.js").MetricStatistics} */
export const calculateMetricStatistics = (values = [], options = {}) => {
  const numbers = validNumbers(values);
  const edgePortion = isFiniteNumber(options.edgePortion) ? Math.min(0.5, Math.max(0.05, options.edgePortion)) : 0.2;
  const minTrendSampleCount = isFiniteNumber(options.minTrendSampleCount) ? Math.max(2, options.minTrendSampleCount) : 3;
  const meaningfulTrendChange = isFiniteNumber(options.meaningfulTrendChange) ? Math.max(0, options.meaningfulTrendChange) : 5;
  const { startMean, endMean } = edgeMean(numbers, edgePortion);
  const change = startMean !== null && endMean !== null ? endMean - startMean : null;
  let trend = METRIC_TREND.INSUFFICIENT;
  if (numbers.length >= minTrendSampleCount && change !== null) {
    if (Math.abs(change) < meaningfulTrendChange) trend = METRIC_TREND.STABLE;
    else trend = change > 0 ? METRIC_TREND.INCREASING : METRIC_TREND.DECREASING;
  }
  return {
    mean: calculateMean(numbers),
    min: calculateMin(numbers),
    max: calculateMax(numbers),
    standardDeviation: calculateStandardDeviation(numbers),
    startMean,
    endMean,
    change,
    trend,
    validCount: numbers.length,
  };
};

const intervalDurationMs = (sample) => {
  const start = Date.parse(sample.intervalStartedAt);
  const end = Date.parse(sample.intervalEndedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
};

const selectDominantSampleEmotion = (samples) => {
  const emotionSamples = samples.filter((sample) => sample.emotion && EMOTION_LABELS.includes(sample.emotion));
  if (emotionSamples.length === 0) return { dominantEmotion: null, dominantEmotionShare: null };
  const counts = new Map();
  emotionSamples.forEach((sample) => counts.set(sample.emotion, (counts.get(sample.emotion) || 0) + 1));
  let dominantEmotion = null;
  let dominantCount = 0;
  EMOTION_LABELS.forEach((label) => {
    const count = counts.get(label) || 0;
    if (count > dominantCount) {
      dominantEmotion = label;
      dominantCount = count;
    }
  });
  return { dominantEmotion, dominantEmotionShare: dominantCount / emotionSamples.length };
};

/** @param {Array<Object>} metricSamples @param {Object} session @param {Object=} options @returns {import("./sessionSchema.js").SessionStatistics} */
export const calculateSessionStatistics = (metricSamples = [], session = {}, options = {}) => {
  const samples = metricSamples.map(normalizeMetricSample).sort((a, b) => Date.parse(a.intervalStartedAt) - Date.parse(b.intervalStartedAt));
  const normalizedSession = normalizeStudySession(session);
  const dataCoverage = calculateMean(samples.map((sample) => sample.dataCoverage)) ?? 0;
  const validSampleCount = samples.filter((sample) => sample.dataQuality !== DATA_QUALITY.INSUFFICIENT).length;
  const { dominantEmotion, dominantEmotionShare } = selectDominantSampleEmotion(samples);
  const startMs = Date.parse(normalizedSession.startedAt);
  const endMs = normalizedSession.endedAt ? Date.parse(normalizedSession.endedAt) : null;
  const durationMs = Number.isFinite(normalizedSession.actualDurationMs)
    ? normalizedSession.actualDurationMs
    : Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(0, endMs - startMs)
      : normalizedSession.accumulatedStudyMs || 0;

  return {
    attention: calculateMetricStatistics(samples.map((sample) => sample.attention), options),
    fatigue: calculateMetricStatistics(samples.map((sample) => sample.fatigue), options),
    valence: calculateMetricStatistics(samples.map((sample) => sample.valence), options),
    arousal: calculateMetricStatistics(samples.map((sample) => sample.arousal), options),
    dominantEmotion,
    dominantEmotionShare,
    dataCoverage,
    validSampleCount,
    totalSampleCount: samples.length,
    durationMs,
    monitoredDurationMs: samples.reduce((sum, sample) => sum + intervalDurationMs(sample) * sample.dataCoverage, 0),
  };
};
