import {
  DATA_QUALITY,
  DEFAULT_PIPELINE_VERSION,
  EMOTION_LABELS,
  METRIC_AGGREGATION_VERSION,
  SESSION_SCHEMA_VERSION,
  SESSION_STATUS,
  SESSION_SUMMARY_ALGORITHM_VERSION,
} from "./sessionConstants.js";

/** @typedef {{id:string,userId:string|null,taskDescription:string,targetDurationMs:number|null,startedAt:string,endedAt:string|null,createdAt:string,updatedAt:string,status:string,accumulatedStudyMs:number,schemaVersion:string,pipelineVersion:string,aggregationVersion:string,summaryAlgorithmVersion:string}} ActiveStudySession */
/** @typedef {{recordedAt:string,elapsedMs:number,attention:number|null,fatigue:number|null,valence:number|null,arousal:number|null,emotion:string|null,emotionConfidence:number|null,faceDetected:boolean,affectValid:boolean,dataValid:boolean}} MetricObservation */
/** @typedef {{id:string,sessionId:string,recordedAt:string,intervalStartedAt:string,intervalEndedAt:string,elapsedMs:number,attention:number|null,fatigue:number|null,valence:number|null,arousal:number|null,emotion:string|null,emotionConfidence:number|null,validObservationCount:number,expectedObservationCount:number,affectObservationCount:number,dataCoverage:number,dataQuality:string,aggregationVersion:string}} MetricSample */
/** @typedef {{mean:number|null,min:number|null,max:number|null,standardDeviation:number|null,startMean:number|null,endMean:number|null,change:number|null,trend:string,validCount:number}} MetricStatistics */
/** @typedef {{attention:MetricStatistics,fatigue:MetricStatistics,valence:MetricStatistics,arousal:MetricStatistics,dominantEmotion:string|null,dominantEmotionShare:number|null,dataCoverage:number,validSampleCount:number,totalSampleCount:number,durationMs:number,monitoredDurationMs:number}} SessionStatistics */
/** @typedef {{label:string,title:string,message:string,confidence:string}} SummarySection */
/** @typedef {{overallStatus:SummarySection,behavioralEngagement:SummarySection,fatiguePattern:SummarySection,emotionalEngagement:SummarySection,dataReliability:SummarySection,generatedAt:string,algorithmVersion:string,thresholdProfile:Object}} SessionSummary */
/** @typedef {ActiveStudySession & {status:"completed",endedAt:string,actualDurationMs:number,monitoredDurationMs:number,statistics:SessionStatistics,summary:SessionSummary,sampleCount:number,dataCoverage:number}} CompletedStudySession */

const VALID_STATUSES = new Set(Object.values(SESSION_STATUS));
const VALID_DATA_QUALITIES = new Set(Object.values(DATA_QUALITY));
const VALID_EMOTIONS = new Set(EMOTION_LABELS);
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const result = (errors = [], warnings = []) => ({ valid: errors.length === 0, errors, warnings });
const nowIso = () => new Date().toISOString();
let generatedSessionIdCounter = 0;
const defaultIdFactory = (prefix = "session") => {
  generatedSessionIdCounter += 1;
  return `${prefix}-${Date.now()}-${generatedSessionIdCounter}`;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const text = (value, fallback = "") => (value === null || value === undefined ? fallback : String(value));
const nullableText = (value) => (value === null || value === undefined || value === "" ? null : String(value));
const iso = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : fallback;
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};
const ms = (value, fallback = null) => (isFiniteNumber(value) && value >= 0 ? value : fallback);
const count = (value, fallback = 0) => (isFiniteNumber(value) && value >= 0 ? Math.floor(value) : fallback);
const metric = (value, min, max) => (isFiniteNumber(value) ? clamp(value, min, max) : null);
const bool = (value) => value === true;
const validIso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const validateVersion = (name, value, errors) => {
  if (!nonEmpty(value)) errors.push(`${name} must be a non-empty version string.`);
};

/** Create a normalized active study session with injectable ID and clock factories. @param {Partial<ActiveStudySession>} input @param {{idFactory?:Function,now?:Function}=} options @returns {ActiveStudySession} */
export const createStudySession = (input = {}, options = {}) => {
  const currentTime = iso((options.now || nowIso)(), nowIso());
  const session = {
    id: text(input.id || (options.idFactory || defaultIdFactory)("session")),
    userId: nullableText(input.userId),
    taskDescription: text(input.taskDescription, ""),
    targetDurationMs: ms(input.targetDurationMs, null),
    startedAt: iso(input.startedAt, currentTime),
    endedAt: iso(input.endedAt, null),
    createdAt: iso(input.createdAt, currentTime),
    updatedAt: iso(input.updatedAt, currentTime),
    status: input.status || SESSION_STATUS.ACTIVE,
    accumulatedStudyMs: ms(input.accumulatedStudyMs, 0),
    schemaVersion: input.schemaVersion || SESSION_SCHEMA_VERSION,
    pipelineVersion: input.pipelineVersion || DEFAULT_PIPELINE_VERSION,
    aggregationVersion: input.aggregationVersion || METRIC_AGGREGATION_VERSION,
    summaryAlgorithmVersion: input.summaryAlgorithmVersion || SESSION_SUMMARY_ALGORITHM_VERSION,
  };
  const validation = validateStudySession(session);
  if (!validation.valid) throw new Error(`Invalid study session: ${validation.errors.join(" ")}`);
  return session;
};

/** Normalize a persisted or in-memory study session shape without generating missing required IDs. @param {Object} input @returns {ActiveStudySession|CompletedStudySession} */
export const normalizeStudySession = (input = {}) => {
  const base = {
    id: text(input.id, ""),
    userId: nullableText(input.userId),
    taskDescription: text(input.taskDescription, ""),
    targetDurationMs: ms(input.targetDurationMs, null),
    startedAt: iso(input.startedAt, null),
    endedAt: iso(input.endedAt, null),
    createdAt: iso(input.createdAt, null),
    updatedAt: iso(input.updatedAt, null),
    status: input.status || SESSION_STATUS.IDLE,
    accumulatedStudyMs: ms(input.accumulatedStudyMs, 0),
    schemaVersion: input.schemaVersion || SESSION_SCHEMA_VERSION,
    pipelineVersion: input.pipelineVersion || DEFAULT_PIPELINE_VERSION,
    aggregationVersion: input.aggregationVersion || METRIC_AGGREGATION_VERSION,
    summaryAlgorithmVersion: input.summaryAlgorithmVersion || SESSION_SUMMARY_ALGORITHM_VERSION,
  };
  if (input.status === SESSION_STATUS.COMPLETED || input.actualDurationMs !== undefined) {
    return {
      ...base,
      status: SESSION_STATUS.COMPLETED,
      actualDurationMs: ms(input.actualDurationMs, 0),
      monitoredDurationMs: ms(input.monitoredDurationMs, 0),
      statistics: input.statistics || null,
      summary: input.summary || null,
      sampleCount: count(input.sampleCount, 0),
      dataCoverage: metric(input.dataCoverage, 0, 1) ?? 0,
    };
  }
  return base;
};

/** Validate study-session shape. @param {Object} session */
export const validateStudySession = (session) => {
  const errors = [];
  const warnings = [];
  if (!isObject(session)) return result(["Session must be an object."]);
  if (!nonEmpty(session.id)) errors.push("Session id is required.");
  if (session.userId !== null && session.userId !== undefined && typeof session.userId !== "string") errors.push("userId must be a string or null.");
  if (typeof session.taskDescription !== "string") errors.push("taskDescription must be a string.");
  if (session.targetDurationMs !== null && !isFiniteNumber(session.targetDurationMs)) errors.push("targetDurationMs must be a number or null.");
  if (!validIso(session.startedAt)) errors.push("startedAt must be an ISO 8601 timestamp.");
  if (session.endedAt !== null && !validIso(session.endedAt)) errors.push("endedAt must be an ISO 8601 timestamp or null.");
  if (!validIso(session.createdAt)) errors.push("createdAt must be an ISO 8601 timestamp.");
  if (!validIso(session.updatedAt)) errors.push("updatedAt must be an ISO 8601 timestamp.");
  if (!VALID_STATUSES.has(session.status)) errors.push(`status must be one of: ${Array.from(VALID_STATUSES).join(", ")}.`);
  if (!isFiniteNumber(session.accumulatedStudyMs) || session.accumulatedStudyMs < 0) errors.push("accumulatedStudyMs must be non-negative.");
  validateVersion("schemaVersion", session.schemaVersion, errors);
  validateVersion("pipelineVersion", session.pipelineVersion, errors);
  validateVersion("aggregationVersion", session.aggregationVersion, errors);
  validateVersion("summaryAlgorithmVersion", session.summaryAlgorithmVersion, errors);
  if (session.status === SESSION_STATUS.COMPLETED) {
    if (!validIso(session.endedAt)) errors.push("completed sessions require endedAt.");
    if (!isFiniteNumber(session.actualDurationMs) || session.actualDurationMs < 0) errors.push("completed sessions require actualDurationMs.");
    if (!isFiniteNumber(session.monitoredDurationMs) || session.monitoredDurationMs < 0) errors.push("completed sessions require monitoredDurationMs.");
    if (!isFiniteNumber(session.dataCoverage) || session.dataCoverage < 0 || session.dataCoverage > 1) errors.push("completed sessions require dataCoverage from 0 to 1.");
    if (!session.statistics) warnings.push("completed session has no statistics object.");
    if (!session.summary) warnings.push("completed session has no summary object.");
  }
  return result(errors, warnings);
};

/** @param {Partial<MetricObservation>} input @returns {MetricObservation} */
export const normalizeMetricObservation = (input = {}) => ({
  recordedAt: iso(input.recordedAt, nowIso()),
  elapsedMs: ms(input.elapsedMs, 0),
  attention: metric(input.attention, 0, 100),
  fatigue: metric(input.fatigue, 0, 100),
  valence: metric(input.valence, -1, 1),
  arousal: metric(input.arousal, -1, 1),
  emotion: VALID_EMOTIONS.has(input.emotion) ? input.emotion : null,
  emotionConfidence: metric(input.emotionConfidence, 0, 1),
  faceDetected: bool(input.faceDetected),
  affectValid: bool(input.affectValid),
  dataValid: bool(input.dataValid),
});

/** Normalize a future 10-second metric sample. Metric values are interval means, not instantaneous readings. @param {Partial<MetricSample>} input @returns {MetricSample} */
export const normalizeMetricSample = (input = {}) => ({
  id: text(input.id, ""),
  sessionId: text(input.sessionId, ""),
  recordedAt: iso(input.recordedAt, null),
  intervalStartedAt: iso(input.intervalStartedAt, null),
  intervalEndedAt: iso(input.intervalEndedAt, null),
  elapsedMs: ms(input.elapsedMs, 0),
  attention: metric(input.attention, 0, 100),
  fatigue: metric(input.fatigue, 0, 100),
  valence: metric(input.valence, -1, 1),
  arousal: metric(input.arousal, -1, 1),
  emotion: VALID_EMOTIONS.has(input.emotion) ? input.emotion : null,
  emotionConfidence: metric(input.emotionConfidence, 0, 1),
  validObservationCount: count(input.validObservationCount, 0),
  expectedObservationCount: count(input.expectedObservationCount, 0),
  affectObservationCount: count(input.affectObservationCount, 0),
  dataCoverage: metric(input.dataCoverage, 0, 1) ?? 0,
  dataQuality: VALID_DATA_QUALITIES.has(input.dataQuality) ? input.dataQuality : DATA_QUALITY.INSUFFICIENT,
  aggregationVersion: input.aggregationVersion || METRIC_AGGREGATION_VERSION,
});

/** Validate a metric sample. @param {Object} sample */
export const validateMetricSample = (sample) => {
  const errors = [];
  const warnings = [];
  if (!isObject(sample)) return result(["MetricSample must be an object."]);
  if (!nonEmpty(sample.id)) errors.push("MetricSample id is required.");
  if (!nonEmpty(sample.sessionId)) errors.push("MetricSample sessionId is required.");
  if (!validIso(sample.recordedAt)) errors.push("MetricSample recordedAt must be an ISO 8601 timestamp.");
  if (!validIso(sample.intervalStartedAt)) errors.push("MetricSample intervalStartedAt must be an ISO 8601 timestamp.");
  if (!validIso(sample.intervalEndedAt)) errors.push("MetricSample intervalEndedAt must be an ISO 8601 timestamp.");
  if (!isFiniteNumber(sample.elapsedMs) || sample.elapsedMs < 0) errors.push("MetricSample elapsedMs must be non-negative.");
  if (!isFiniteNumber(sample.validObservationCount) || sample.validObservationCount < 0) errors.push("validObservationCount must be non-negative.");
  if (!isFiniteNumber(sample.expectedObservationCount) || sample.expectedObservationCount < 0) errors.push("expectedObservationCount must be non-negative.");
  if (!isFiniteNumber(sample.affectObservationCount) || sample.affectObservationCount < 0) errors.push("affectObservationCount must be non-negative.");
  if (!isFiniteNumber(sample.dataCoverage) || sample.dataCoverage < 0 || sample.dataCoverage > 1) errors.push("dataCoverage must be between 0 and 1.");
  if (!VALID_DATA_QUALITIES.has(sample.dataQuality)) errors.push("dataQuality is invalid.");
  validateVersion("aggregationVersion", sample.aggregationVersion, errors);
  if (sample.valence === null || sample.arousal === null) warnings.push("MetricSample has missing affect values.");
  return result(errors, warnings);
};

/** Create a completed-session record. MetricSamples remain separate in repositories. @param {ActiveStudySession} session @param {Object} completion @returns {CompletedStudySession} */
export const createCompletedStudySession = (session, completion = {}) => {
  const normalized = normalizeStudySession(session);
  const endedAt = iso(completion.endedAt, nowIso());
  const start = Date.parse(normalized.startedAt);
  const end = Date.parse(endedAt);
  const durationFromTimestamps = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
  const completed = normalizeStudySession({
    ...normalized,
    status: SESSION_STATUS.COMPLETED,
    endedAt,
    actualDurationMs: ms(completion.actualDurationMs, durationFromTimestamps),
    monitoredDurationMs: ms(completion.monitoredDurationMs, normalized.accumulatedStudyMs),
    statistics: completion.statistics || null,
    summary: completion.summary || null,
    sampleCount: completion.sampleCount,
    dataCoverage: completion.dataCoverage,
    updatedAt: endedAt,
  });
  const validation = validateStudySession(completed);
  if (!validation.valid) throw new Error(`Invalid completed study session: ${validation.errors.join(" ")}`);
  return completed;
};
