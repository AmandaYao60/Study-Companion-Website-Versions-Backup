import { SESSION_STATUS } from "./sessionConstants.js";
import { calculateMetricStatistics, calculateSessionStatistics } from "./sessionStatistics.js";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const timestampMs = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};
const newestTime = (session) => Math.max(timestampMs(session.endedAt), timestampMs(session.updatedAt), timestampMs(session.startedAt));
const sampleTime = (sample) => timestampMs(sample.intervalStartedAt || sample.recordedAt);
const sortSamplesChronologically = (samples = []) => [...samples].sort((a, b) => {
  const timeDiff = sampleTime(a) - sampleTime(b);
  if (timeDiff !== 0) return timeDiff;
  return String(a.id || "").localeCompare(String(b.id || ""));
});
const meanFinite = (values = []) => {
  const numbers = values.filter(isFiniteNumber);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};

/** Sort sessions newest first without mutating the input. @param {Array<Object>} sessions */
export const sortSessionsByNewest = (sessions = []) => [...sessions].sort((a, b) => {
  const timeDiff = newestTime(b) - newestTime(a);
  if (timeDiff !== 0) return timeDiff;
  return String(a.id || "").localeCompare(String(b.id || ""));
});

/** @param {Array<Object>} sessions */
export const selectLatestCompletedSession = (sessions = []) => sortSessionsByNewest(
  sessions.filter((session) => session.status === SESSION_STATUS.COMPLETED)
)[0] || null;

/** @param {Object} session */
export const selectSessionListRow = (session = {}) => ({
  id: session.id,
  dateTime: session.endedAt || session.startedAt || session.createdAt || null,
  taskDescription: session.taskDescription || "",
  targetDurationMs: session.targetDurationMs ?? null,
  actualDurationMs: session.actualDurationMs ?? null,
  dataCoverage: session.dataCoverage ?? null,
});

/** @param {Array<Object>} samples */
export const selectBehavioralTimeline = (samples = []) => sortSamplesChronologically(samples).map((sample) => ({
  id: sample.id,
  elapsedMs: sample.elapsedMs,
  attention: isFiniteNumber(sample.attention) ? sample.attention : null,
  fatigue: isFiniteNumber(sample.fatigue) ? sample.fatigue : null,
  dataQuality: sample.dataQuality,
}));

/** @param {Array<Object>} samples */
export const selectEmotionalTrajectory = (samples = []) => sortSamplesChronologically(samples)
  .filter((sample) => isFiniteNumber(sample.valence) && isFiniteNumber(sample.arousal))
  .map((sample) => ({
    id: sample.id,
    elapsedMs: sample.elapsedMs,
    valence: sample.valence,
    arousal: sample.arousal,
    emotion: sample.emotion ?? null,
    emotionConfidence: isFiniteNumber(sample.emotionConfidence) ? sample.emotionConfidence : null,
    dataQuality: sample.dataQuality,
  }));

/** @param {Array<Object>} samples */
export const selectMetricAverages = (samples = []) => ({
  attention: meanFinite(samples.map((sample) => sample.attention)),
  fatigue: meanFinite(samples.map((sample) => sample.fatigue)),
  valence: meanFinite(samples.map((sample) => sample.valence)),
  arousal: meanFinite(samples.map((sample) => sample.arousal)),
});

/** @param {Array<Object>} samples */
export const selectEmotionalMeanPoint = (samples = []) => {
  const trajectory = selectEmotionalTrajectory(samples);
  const valence = meanFinite(trajectory.map((point) => point.valence));
  const arousal = meanFinite(trajectory.map((point) => point.arousal));
  if (!isFiniteNumber(valence) || !isFiniteNumber(arousal)) return null;
  return { valence, arousal };
};

const metricDefinitions = Object.freeze([
  { id: "attention", label: "Attention", rangeLabel: "0-100", valueKind: "percentage" },
  { id: "fatigue", label: "Fatigue", rangeLabel: "0-100", valueKind: "percentage" },
  { id: "valence", label: "Valence", rangeLabel: "-1 to 1", valueKind: "affect" },
  { id: "arousal", label: "Arousal", rangeLabel: "-1 to 1", valueKind: "affect" },
]);

const getStatistics = (session, samples) => session?.statistics || calculateSessionStatistics(samples, session || {});

/** Select the dashboard source in priority order: active session, latest completed session, empty state. @param {Object} input */
export const selectDashboardSessionSource = ({ activeSession = null, completedSessions = [] } = {}) => {
  if (activeSession) {
    return { kind: "active", label: "Live Session", session: activeSession };
  }

  const latestCompleted = selectLatestCompletedSession(completedSessions);
  if (latestCompleted) {
    return { kind: "completed", label: "Session Complete", session: latestCompleted };
  }

  return { kind: "empty", label: "No Session Data", session: null };
};

/** Return dashboard metric card models without exposing repository or statistics details to components. @param {Object} input */
export const selectDashboardMetricCards = ({ session = null, samples = [], currentMetrics = null, liveMetrics = [], isActive = false } = {}) => {
  if (!session) {
    return metricDefinitions.map((definition) => ({
      ...definition,
      currentValue: null,
      averageValue: null,
      trend: "insufficient",
      status: "No session data",
      dataQuality: null,
    }));
  }

  const latest = samples[samples.length - 1] || {};
  const latestLive = liveMetrics[liveMetrics.length - 1] || null;
  const statistics = getStatistics(session, samples);

  return metricDefinitions.map((definition) => {
    const metricStats = isActive
      ? calculateMetricStatistics(liveMetrics.map((row) => row[definition.id]))
      : statistics?.[definition.id] || {};
    const currentValue = isActive
      ? currentMetrics?.[definition.id] ?? latestLive?.[definition.id] ?? null
      : latest[definition.id] ?? metricStats.mean ?? null;

    return {
      ...definition,
      currentValue,
      averageValue: metricStats.mean ?? null,
      trend: metricStats.trend || "insufficient",
      status: metricStats.validCount > 0 ? metricStats.trend || "available" : "Unavailable",
      dataQuality: isActive ? latestLive?.dataQuality ?? null : latest.dataQuality ?? null,
    };
  });
};

/** Return structured summary sections in a stable render order. @param {Object|null} session */
export const selectSessionSummarySections = (session = null) => {
  const summary = session?.summary;
  if (!summary) return [];
  return [
    ["behavioralEngagement", "Behavioral Engagement"],
    ["fatiguePattern", "Fatigue Pattern"],
    ["emotionalEngagement", "Emotional Engagement"],
    ["dataReliability", "Data Reliability"],
    ["overallStatus", "Overall Status"],
  ]
    .map(([key, fallbackTitle]) => ({ key, fallbackTitle, section: summary[key] }))
    .filter((item) => item.section);
};

/** Build newest-first rows for the future Session History table. @param {Array<Object>} sessions */
export const selectSessionHistoryRows = (sessions = []) => sortSessionsByNewest(sessions).map(selectSessionListRow);

/** @param {Array<Object>} sessions @param {{start?:string|Date,end?:string|Date}} range */
export const selectSessionsWithinRange = (sessions = [], range = {}) => {
  const start = range.start ? timestampMs(range.start) : Number.NEGATIVE_INFINITY;
  const end = range.end ? timestampMs(range.end) : Number.POSITIVE_INFINITY;
  return sortSessionsByNewest(sessions.filter((session) => {
    const time = newestTime(session);
    return time >= start && time <= end;
  }));
};
