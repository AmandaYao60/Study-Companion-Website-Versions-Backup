import { SESSION_STATUS } from "./sessionConstants.js";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const timestampMs = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};
const newestTime = (session) => Math.max(timestampMs(session.endedAt), timestampMs(session.updatedAt), timestampMs(session.startedAt));

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
export const selectBehavioralTimeline = (samples = []) => samples.map((sample) => ({
  elapsedMs: sample.elapsedMs,
  attention: sample.attention ?? null,
  fatigue: sample.fatigue ?? null,
  dataQuality: sample.dataQuality,
}));

/** @param {Array<Object>} samples */
export const selectEmotionalTrajectory = (samples = []) => samples
  .filter((sample) => isFiniteNumber(sample.valence) && isFiniteNumber(sample.arousal))
  .map((sample) => ({
    elapsedMs: sample.elapsedMs,
    valence: sample.valence,
    arousal: sample.arousal,
    emotion: sample.emotion ?? null,
    emotionConfidence: sample.emotionConfidence ?? null,
    dataQuality: sample.dataQuality,
  }));

/** Return simple presentation-ready cards for a future Dashboard without React dependencies. @param {Object} session @param {Array<Object>} samples */
export const selectDashboardMetricCards = (session = {}, samples = []) => {
  const latest = samples[samples.length - 1] || {};
  return [
    { id: "attention", label: "Attention", value: latest.attention ?? null, dataQuality: latest.dataQuality ?? null },
    { id: "fatigue", label: "Fatigue", value: latest.fatigue ?? null, dataQuality: latest.dataQuality ?? null },
    { id: "dataCoverage", label: "Data Coverage", value: session.dataCoverage ?? null, dataQuality: latest.dataQuality ?? null },
    { id: "dominantEmotion", label: "Dominant Emotion", value: session.statistics?.dominantEmotion ?? null, dataQuality: latest.dataQuality ?? null },
  ];
};

/** @param {Array<Object>} sessions @param {{start?:string|Date,end?:string|Date}} range */
export const selectSessionsWithinRange = (sessions = [], range = {}) => {
  const start = range.start ? timestampMs(range.start) : Number.NEGATIVE_INFINITY;
  const end = range.end ? timestampMs(range.end) : Number.POSITIVE_INFINITY;
  return sortSessionsByNewest(sessions.filter((session) => {
    const time = newestTime(session);
    return time >= start && time <= end;
  }));
};
