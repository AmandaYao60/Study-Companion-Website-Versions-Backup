import {
  DATA_QUALITY,
  DEFAULT_PIPELINE_VERSION,
  EMOTION_LABELS,
  METRIC_AGGREGATION_VERSION,
  SESSION_SCHEMA_VERSION,
  SESSION_STATUS,
  SESSION_SUMMARY_ALGORITHM_VERSION,
} from "./sessionConstants.js";
import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  SUBJECT_OPTIONS,
  TASK_TYPE_OPTIONS,
  normalizePostSessionCheckOut,
  normalizePreSessionCheckIn,
  validateSelfReportFields,
} from "./sessionSelfReport.js";
import {
  normalizeBreakEvents,
  normalizeInterruptions,
  normalizeSessionPlan,
} from "./sessionBreaks.js";
import {
  BREAK_MODE_AUTOMATIC,
  BREAK_MODE_REGULAR,
  inferBreakMode,
  normalizeAutomaticBreakSuggestionState,
} from "./automaticBreakSuggestionState.js";

/** @typedef {{expectedDifficulty:number|null,taskConfidence:number|null,mood:number|null,energy:number|null,taskValue:number|null,recordedAt:string|null}} PreSessionCheckIn */
/** @typedef {{sessionEnergy:number|null,sessionMood:number|null,perceivedFatigue:number|null,perceivedAttention:number|null,perceivedDifficulty:number|null,goalAttainment:number|null,strategiesUsed:Array<string>,primaryStrategy:string|null,primaryStrategyEffectiveness:number|null,primaryLearningActivity:string|null,learningReflection:string|null,nextSessionAdjustment:string|null,recordedAt:string|null}} PostSessionCheckOut */
/** @typedef {{targetDurationMs:number|null,focusDurationMs:number|null,breakDurationMs:number,plannedBreakCount:number,timingMode?:string}} SessionPlan */
/** @typedef {{id:string,plannedStartElapsedMs:number|null,plannedStartAt:string|null,actualStartElapsedMs:number|null,actualStartAt:string|null,actualEndElapsedMs:number|null,actualEndAt:string|null,status:string}} BreakEvent */
/** @typedef {{id:string,startElapsedMs:number|null,startAt:string|null,endElapsedMs:number|null,endAt:string|null,reason:string}} Interruption */
/** @typedef {{cycleStartElapsedMs:number,handledThresholds:Array<Object>,activePrompt:Object|null}} AutomaticBreakSuggestionState */
/** @typedef {{id:string,userId:string|null,taskName:string,taskDescription:string,targetDurationMs:number|null,subject:string|null,customSubject:string|null,taskType:string|null,customTaskType:string|null,sessionGoal:string|null,preSessionCheckIn:PreSessionCheckIn,postSessionCheckOut:PostSessionCheckOut,questionnaireSchemaVersion:number,breakMode:string,sessionPlan:SessionPlan,breakEvents:Array<BreakEvent>,automaticBreakSuggestionState:AutomaticBreakSuggestionState,interruptions:Array<Interruption>,startedAt:string,endedAt:string|null,createdAt:string,updatedAt:string,status:string,accumulatedStudyMs:number,recoveryPending:boolean,lastCheckpointAt:string|null,schemaVersion:string,pipelineVersion:string,aggregationVersion:string,summaryAlgorithmVersion:string}} ActiveStudySession */
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
const VALID_SUBJECTS = new Set(SUBJECT_OPTIONS);
const VALID_TASK_TYPES = new Set(TASK_TYPE_OPTIONS);
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
const optionalShortText = (value, maxLength = 300) => {
  const normalized = nullableText(value);
  return normalized === null ? null : normalized.trim().slice(0, maxLength) || null;
};
const nullableOption = (value, allowed) => (allowed.has(value) ? value : null);
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
  const sessionPlan = normalizeSessionPlan(input.sessionPlan, {
    targetDurationMs: input.targetDurationMs,
  });
  const breakEvents = normalizeBreakEvents(input.breakEvents);
  const breakMode = inferBreakMode({ breakMode: input.breakMode, sessionPlan, breakEvents });
  const session = {
    ...input,
    id: text(input.id || (options.idFactory || defaultIdFactory)("session")),
    userId: nullableText(input.userId),
    taskName: optionalShortText(input.taskName ?? input.taskDescription, 80) || "",
    taskDescription: optionalShortText(input.taskDescription ?? input.taskName, 80) || "",
    targetDurationMs: ms(input.targetDurationMs, null),
    subject: nullableOption(input.subject, VALID_SUBJECTS),
    customSubject: input.subject === "other" ? optionalShortText(input.customSubject, 80) : null,
    taskType: nullableOption(input.taskType, VALID_TASK_TYPES),
    customTaskType: input.taskType === "other" ? optionalShortText(input.customTaskType, 80) : null,
    sessionGoal: optionalShortText(input.sessionGoal, 300),
    preSessionCheckIn: normalizePreSessionCheckIn(input.preSessionCheckIn),
    postSessionCheckOut: normalizePostSessionCheckOut(input.postSessionCheckOut),
    questionnaireSchemaVersion: Number.isInteger(input.questionnaireSchemaVersion)
      ? input.questionnaireSchemaVersion
      : QUESTIONNAIRE_SCHEMA_VERSION,
    breakMode,
    sessionPlan,
    breakEvents,
    automaticBreakSuggestionState: normalizeAutomaticBreakSuggestionState(input.automaticBreakSuggestionState, {
      timingMode: sessionPlan.timingMode,
    }),
    interruptions: normalizeInterruptions(input.interruptions),
    startedAt: iso(input.startedAt, currentTime),
    endedAt: iso(input.endedAt, null),
    createdAt: iso(input.createdAt, currentTime),
    updatedAt: iso(input.updatedAt, currentTime),
    status: input.status || SESSION_STATUS.ACTIVE,
    accumulatedStudyMs: ms(input.accumulatedStudyMs, 0),
    recoveryPending: bool(input.recoveryPending),
    lastCheckpointAt: iso(input.lastCheckpointAt, null),
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
  const sessionPlan = normalizeSessionPlan(input.sessionPlan, {
    targetDurationMs: input.targetDurationMs,
  });
  const breakEvents = normalizeBreakEvents(input.breakEvents);
  const breakMode = inferBreakMode({ breakMode: input.breakMode, sessionPlan, breakEvents });
  const base = {
    ...input,
    id: text(input.id, ""),
    userId: nullableText(input.userId),
    taskName: optionalShortText(input.taskName ?? input.taskDescription, 80) || "",
    taskDescription: optionalShortText(input.taskDescription ?? input.taskName, 80) || "",
    targetDurationMs: ms(input.targetDurationMs, null),
    subject: nullableOption(input.subject, VALID_SUBJECTS),
    customSubject: input.subject === "other" ? optionalShortText(input.customSubject, 80) : null,
    taskType: nullableOption(input.taskType, VALID_TASK_TYPES),
    customTaskType: input.taskType === "other" ? optionalShortText(input.customTaskType, 80) : null,
    sessionGoal: optionalShortText(input.sessionGoal, 300),
    preSessionCheckIn: normalizePreSessionCheckIn(input.preSessionCheckIn),
    postSessionCheckOut: normalizePostSessionCheckOut(input.postSessionCheckOut),
    questionnaireSchemaVersion: Number.isInteger(input.questionnaireSchemaVersion)
      ? input.questionnaireSchemaVersion
      : QUESTIONNAIRE_SCHEMA_VERSION,
    breakMode,
    sessionPlan,
    breakEvents,
    automaticBreakSuggestionState: normalizeAutomaticBreakSuggestionState(input.automaticBreakSuggestionState, {
      timingMode: sessionPlan.timingMode,
    }),
    interruptions: normalizeInterruptions(input.interruptions),
    startedAt: iso(input.startedAt, null),
    endedAt: iso(input.endedAt, null),
    createdAt: iso(input.createdAt, null),
    updatedAt: iso(input.updatedAt, null),
    status: input.status || SESSION_STATUS.IDLE,
    accumulatedStudyMs: ms(input.accumulatedStudyMs, 0),
    recoveryPending: bool(input.recoveryPending),
    lastCheckpointAt: iso(input.lastCheckpointAt, null),
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
  if (typeof session.taskName !== "string") errors.push("taskName must be a string.");
  if (typeof session.taskDescription !== "string") errors.push("taskDescription must be a string.");
  if (session.targetDurationMs !== null && !isFiniteNumber(session.targetDurationMs)) errors.push("targetDurationMs must be a number or null.");
  if (session.subject !== null && !VALID_SUBJECTS.has(session.subject)) errors.push("subject is invalid.");
  if (session.taskType !== null && !VALID_TASK_TYPES.has(session.taskType)) errors.push("taskType is invalid.");
  if (!isObject(session.preSessionCheckIn)) errors.push("preSessionCheckIn must be an object.");
  if (!isObject(session.postSessionCheckOut)) errors.push("postSessionCheckOut must be an object.");
  if (!Number.isInteger(session.questionnaireSchemaVersion) || session.questionnaireSchemaVersion < 1) errors.push("questionnaireSchemaVersion must be a positive integer.");
  if (![BREAK_MODE_AUTOMATIC, BREAK_MODE_REGULAR].includes(session.breakMode)) errors.push("breakMode must be automatic or regular.");
  if (!isObject(session.sessionPlan)) errors.push("sessionPlan must be an object.");
  if (session.sessionPlan) {
    if (session.sessionPlan.targetDurationMs !== null && !isFiniteNumber(session.sessionPlan.targetDurationMs)) errors.push("sessionPlan.targetDurationMs must be a number or null.");
    if (session.sessionPlan.focusDurationMs !== null && !isFiniteNumber(session.sessionPlan.focusDurationMs)) errors.push("sessionPlan.focusDurationMs must be a number or null.");
    if (!isFiniteNumber(session.sessionPlan.breakDurationMs) || session.sessionPlan.breakDurationMs < 0) errors.push("sessionPlan.breakDurationMs must be non-negative.");
    if (!Number.isInteger(session.sessionPlan.plannedBreakCount) || session.sessionPlan.plannedBreakCount < 0) errors.push("sessionPlan.plannedBreakCount must be a non-negative integer.");
    if (session.sessionPlan.timingMode !== undefined && !["regular", "debug"].includes(session.sessionPlan.timingMode)) errors.push("sessionPlan.timingMode must be regular or debug when present.");
  }
  if (!Array.isArray(session.breakEvents)) errors.push("breakEvents must be an array.");
  if (!isObject(session.automaticBreakSuggestionState)) errors.push("automaticBreakSuggestionState must be an object.");
  if (!Array.isArray(session.interruptions)) errors.push("interruptions must be an array.");
  validateSelfReportFields(session, errors);
  if (!validIso(session.startedAt)) errors.push("startedAt must be an ISO 8601 timestamp.");
  if (session.endedAt !== null && !validIso(session.endedAt)) errors.push("endedAt must be an ISO 8601 timestamp or null.");
  if (!validIso(session.createdAt)) errors.push("createdAt must be an ISO 8601 timestamp.");
  if (!validIso(session.updatedAt)) errors.push("updatedAt must be an ISO 8601 timestamp.");
  if (!VALID_STATUSES.has(session.status)) errors.push(`status must be one of: ${Array.from(VALID_STATUSES).join(", ")}.`);
  if (!isFiniteNumber(session.accumulatedStudyMs) || session.accumulatedStudyMs < 0) errors.push("accumulatedStudyMs must be non-negative.");
  if (typeof session.recoveryPending !== "boolean") errors.push("recoveryPending must be a boolean.");
  if (session.lastCheckpointAt !== null && !validIso(session.lastCheckpointAt)) errors.push("lastCheckpointAt must be an ISO 8601 timestamp or null.");
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

/** Normalize a future 5-second metric sample. Metric values are interval means, not instantaneous readings. @param {Partial<MetricSample>} input @returns {MetricSample} */
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
    recoveryPending: false,
    lastCheckpointAt: iso(completion.lastCheckpointAt, normalized.lastCheckpointAt),
    postSessionCheckOut: completion.postSessionCheckOut ?? normalized.postSessionCheckOut,
    updatedAt: endedAt,
  });
  const validation = validateStudySession(completed);
  if (!validation.valid) throw new Error(`Invalid completed study session: ${validation.errors.join(" ")}`);
  return completed;
};
