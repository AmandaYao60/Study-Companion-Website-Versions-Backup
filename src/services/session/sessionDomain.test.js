import test from "node:test";
import assert from "node:assert/strict";

import {
  BREAK_STATUS,
  DATA_QUALITY,
  DEFAULT_METRIC_TREND_THRESHOLDS,
  EMOTION_LABELS,
  INDEXED_DB_SESSION_DATABASE,
  INTERRUPTION_REASON,
  SESSION_STATUS,
  SESSION_SUMMARY_ALGORITHM_VERSION,
  SUMMARY_EVIDENCE_TYPE,
  aggregateMetricObservations,
  calculateMetricStatistics,
  calculateSessionStatistics,
  calculatePlannedBreakPositions,
  cancelBreak,
  coerceDebugBreakDurationForFocus,
  coerceBreakDurationForFocus,
  completeBreak,
  classifyDataQuality,
  createCompletedStudySession,
  createIndexedDbSessionRepository,
  createMemorySessionRepository,
  createSessionRuntime,
  createStudySession,
  generateSessionSummary,
  getNextScheduledBreak,
  classifySessionDaypart,
  isValidDebugBreakDuration,
  isValidDebugBreakFocusDuration,
  isValidBreakDuration,
  isValidBreakFocusDuration,
  normalizeBreakEvents,
  normalizeInterruptions,
  normalizePostSessionCheckOut,
  normalizeSessionPlan,
  normalizeStudySession,
  selectDashboardMetricCards,
  selectDashboardSessionSource,
  selectDominantEmotion,
  selectExpressionIntervalDistribution,
  selectLearnerObservedSignalComparison,
  selectLongTermSessionPatterns,
  selectSessionScopedMetricSamples,
  selectSessionSelfReportAnalysis,
  selectSessionSummaryPresentation,
  selectSessionSummarySections,
  skipBreak,
  startBreakExtension,
  sortSessionsByNewest,
  startPlannedBreak,
  validateStudySession,
  validateSessionRepositoryContract,
} from "./index.js";

const baseTime = "2026-01-01T00:00:00.000Z";
const sampleWindow = {
  sessionId: "session-1",
  sampleId: "sample-1",
  intervalStartedAt: baseTime,
  intervalEndedAt: "2026-01-01T00:00:10.000Z",
  expectedObservationCount: 4,
  elapsedMs: 10000,
};

test("valid zero values are preserved and missing valence remains null", () => {
  const sample = aggregateMetricObservations([
    { recordedAt: baseTime, elapsedMs: 0, attention: 0, fatigue: 0, valence: 0, arousal: 0, emotion: "Neutral", emotionConfidence: 0, affectValid: true, dataValid: true },
    { recordedAt: baseTime, elapsedMs: 1000, attention: null, fatigue: undefined, valence: undefined, arousal: undefined, affectValid: false, dataValid: true },
  ], { ...sampleWindow, expectedObservationCount: 2 });

  assert.equal(sample.attention, 0);
  assert.equal(sample.fatigue, 0);
  assert.equal(sample.valence, 0);
  assert.equal(sample.arousal, 0);
  assert.equal(sample.emotionConfidence, 0);

  const missingAffect = aggregateMetricObservations([
    { recordedAt: baseTime, elapsedMs: 0, attention: 50, fatigue: 10, affectValid: false, dataValid: true },
  ], { ...sampleWindow, sampleId: "sample-2", expectedObservationCount: 1 });

  assert.equal(missingAffect.valence, null);
  assert.equal(missingAffect.arousal, null);
});

test("mixed valid and invalid observations aggregate independently", () => {
  const sample = aggregateMetricObservations([
    { recordedAt: baseTime, elapsedMs: 0, attention: 80, fatigue: 20, valence: 0.2, arousal: 0.4, emotion: "Happiness", emotionConfidence: 0.7, affectValid: true, dataValid: true },
    { recordedAt: baseTime, elapsedMs: 1000, attention: 60, fatigue: 40, valence: Number.NaN, arousal: Infinity, emotion: "BadLabel", emotionConfidence: 0.9, affectValid: true, dataValid: true },
    { recordedAt: baseTime, elapsedMs: 2000, attention: 10, fatigue: 90, valence: -0.5, arousal: 0.2, emotion: "Sadness", emotionConfidence: 0.8, affectValid: true, dataValid: false },
    { recordedAt: baseTime, elapsedMs: 3000, attention: 40, fatigue: 30, affectValid: false, dataValid: true },
  ], sampleWindow);

  assert.equal(sample.attention, 60);
  assert.equal(sample.fatigue, 30);
  assert.equal(sample.valence, 0.2);
  assert.equal(sample.arousal, 0.4);
  assert.equal(sample.affectObservationCount, 2);
  assert.equal(sample.validObservationCount, 3);
  assert.equal(sample.dataCoverage, 0.75);
});

test("attention and fatigue remain valid when affect data is missing", () => {
  const sample = aggregateMetricObservations([
    { recordedAt: baseTime, elapsedMs: 0, attention: 75, fatigue: 25, affectValid: false, dataValid: true },
    { recordedAt: baseTime, elapsedMs: 1000, attention: 65, fatigue: 35, affectValid: false, dataValid: true },
  ], { ...sampleWindow, expectedObservationCount: 2 });

  assert.equal(sample.attention, 70);
  assert.equal(sample.fatigue, 30);
  assert.equal(sample.valence, null);
  assert.equal(sample.arousal, null);
});

test("dominant emotion selection and coverage classification are deterministic", () => {
  const dominant = selectDominantEmotion([
    { emotion: "Sadness", emotionConfidence: 0.9, dataValid: true },
    { emotion: "Happiness", emotionConfidence: 0.8, dataValid: true },
  ]);

  assert.equal(dominant.emotion, "Happiness");
  assert.equal(classifyDataQuality(0.8), DATA_QUALITY.GOOD);
  assert.equal(classifyDataQuality(0.5), DATA_QUALITY.PARTIAL);
  assert.equal(classifyDataQuality(0.49), DATA_QUALITY.INSUFFICIENT);
});

test("statistics ignore null values and trends require enough data", () => {
  const insufficient = calculateMetricStatistics([10, null, Number.NaN], { minTrendSampleCount: 3 });
  assert.equal(insufficient.mean, 10);
  assert.equal(insufficient.trend, "insufficient");

  const increasing = calculateMetricStatistics([10, null, 20, 35, 50], { meaningfulTrendChange: 10 });
  assert.equal(increasing.mean, 28.75);
  assert.equal(increasing.trend, "increasing");
});

test("dashboard live cards use current values but sample-only trends", () => {
  const samples = [
    { id: "late", sessionId: "s1", recordedAt: "2026-01-01T00:00:20.000Z", intervalStartedAt: "2026-01-01T00:00:20.000Z", intervalEndedAt: "2026-01-01T00:00:25.000Z", elapsedMs: 25000, attention: 30, fatigue: 30, valence: 0.2, arousal: 0.2, dataQuality: "good" },
    { id: "early", sessionId: "s1", recordedAt: "2026-01-01T00:00:00.000Z", intervalStartedAt: "2026-01-01T00:00:00.000Z", intervalEndedAt: "2026-01-01T00:00:05.000Z", elapsedMs: 5000, attention: 10, fatigue: 10, valence: 0.1, arousal: 0.1, dataQuality: "partial" },
    { id: "middle", sessionId: "s1", recordedAt: "2026-01-01T00:00:10.000Z", intervalStartedAt: "2026-01-01T00:00:10.000Z", intervalEndedAt: "2026-01-01T00:00:15.000Z", elapsedMs: 15000, attention: 20, fatigue: 20, valence: 0.15, arousal: 0.15, dataQuality: "good" },
  ];

  const cards = selectDashboardMetricCards({
    session: { id: "active-session" },
    samples,
    currentMetrics: { attention: 88, fatigue: 12, valence: 0.4, arousal: 0.1 },
    isActive: true,
  });
  const attention = cards.find((card) => card.id === "attention");

  assert.equal(attention.currentValue, 88);
  assert.equal(attention.trend, "increasing");
  assert.equal(attention.dataQuality, "good");
});

test("dashboard completed card latest values and trends use chronological samples", () => {
  const samples = [
    { id: "late", sessionId: "s1", recordedAt: "2026-01-01T00:00:20.000Z", intervalStartedAt: "2026-01-01T00:00:20.000Z", intervalEndedAt: "2026-01-01T00:00:25.000Z", elapsedMs: 25000, attention: 30, fatigue: 30, valence: 0.02, arousal: 0.02, emotionConfidence: null, dataQuality: "good" },
    { id: "early", sessionId: "s1", recordedAt: "2026-01-01T00:00:00.000Z", intervalStartedAt: "2026-01-01T00:00:00.000Z", intervalEndedAt: "2026-01-01T00:00:05.000Z", elapsedMs: 5000, attention: 10, fatigue: 10, valence: 0, arousal: 0, emotionConfidence: null, dataQuality: "partial" },
    { id: "middle", sessionId: "s1", recordedAt: "2026-01-01T00:00:10.000Z", intervalStartedAt: "2026-01-01T00:00:10.000Z", intervalEndedAt: "2026-01-01T00:00:15.000Z", elapsedMs: 15000, attention: 20, fatigue: 20, valence: 0.04, arousal: 0.04, emotionConfidence: null, dataQuality: "good" },
  ];

  const cards = selectDashboardMetricCards({
    session: { id: "completed-session" },
    samples,
    isActive: false,
  });
  const attention = cards.find((card) => card.id === "attention");
  const valence = cards.find((card) => card.id === "valence");

  assert.equal(attention.currentValue, 30);
  assert.equal(attention.trend, "increasing");
  assert.equal(valence.trend, "stable");
});

test("session-scoped metric sample selector rejects stale samples from another session", () => {
  const currentSamples = [
    { id: "current-1", sessionId: "current-session", attention: 80 },
    { id: "current-2", sessionId: "current-session", attention: 70 },
  ];
  const staleSamples = [
    { id: "stale-1", sessionId: "previous-session", attention: 30 },
  ];
  const mixedSamples = [
    ...currentSamples,
    { id: "mixed-stale", sessionId: "previous-session", attention: 10 },
  ];

  assert.deepEqual(selectSessionScopedMetricSamples(currentSamples, "current-session"), currentSamples);
  assert.deepEqual(selectSessionScopedMetricSamples(staleSamples, "current-session"), []);
  assert.deepEqual(selectSessionScopedMetricSamples(mixedSamples, "current-session"), []);
  assert.deepEqual(selectSessionScopedMetricSamples(currentSamples, null), []);
});

test("session trend thresholds have one exported source of truth", () => {
  assert.deepEqual(DEFAULT_METRIC_TREND_THRESHOLDS, {
    attention: 5,
    fatigue: 5,
    valence: 0.05,
    arousal: 0.05,
  });

  const statistics = calculateSessionStatistics([
    { id: "s1-1", sessionId: "s1", recordedAt: "2026-01-01T00:00:00.000Z", intervalStartedAt: "2026-01-01T00:00:00.000Z", intervalEndedAt: "2026-01-01T00:00:05.000Z", elapsedMs: 5000, attention: 10, fatigue: 10, valence: 0, arousal: 0, emotionConfidence: null, dataQuality: "good" },
    { id: "s1-2", sessionId: "s1", recordedAt: "2026-01-01T00:00:10.000Z", intervalStartedAt: "2026-01-01T00:00:10.000Z", intervalEndedAt: "2026-01-01T00:00:15.000Z", elapsedMs: 15000, attention: 13, fatigue: 13, valence: 0.04, arousal: 0.04, emotionConfidence: null, dataQuality: "good" },
    { id: "s1-3", sessionId: "s1", recordedAt: "2026-01-01T00:00:20.000Z", intervalStartedAt: "2026-01-01T00:00:20.000Z", intervalEndedAt: "2026-01-01T00:00:25.000Z", elapsedMs: 25000, attention: 14, fatigue: 14, valence: 0.04, arousal: 0.04, emotionConfidence: null, dataQuality: "good" },
  ], { id: "s1" });

  assert.equal(statistics.attention.trend, "stable");
  assert.equal(statistics.valence.trend, "stable");
});

test("empty session statistics alone return the neutral unavailable summary state", () => {
  const statistics = calculateSessionStatistics([], { id: "session-1" });
  const summary = generateSessionSummary({ statistics, now: () => baseTime });
  assert.equal(summary.summaryVersion, 2);
  assert.equal(summary.algorithmVersion, SESSION_SUMMARY_ALGORITHM_VERSION);
  assert.equal(summary.summaryUnavailable.confidence, "insufficient");
  assert.equal(summary.observedStudySignals, undefined);
  assert.deepEqual(Object.keys(summary).filter((key) => key.endsWith("Signals")), []);
});

test("memory repository separates session summaries from samples and deletes samples with sessions", async () => {
  const repository = createMemorySessionRepository();
  const session = createStudySession({ id: "session-1", startedAt: baseTime, createdAt: baseTime, updatedAt: baseTime }, { now: () => baseTime });
  await repository.createSession(session);

  const sample = aggregateMetricObservations([
    { recordedAt: baseTime, elapsedMs: 0, attention: 90, fatigue: 5, affectValid: false, dataValid: true },
  ], { ...sampleWindow, expectedObservationCount: 1 });
  await repository.appendMetricSamples(session.id, [sample]);

  const summaries = await repository.listSessionSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(Object.hasOwn(summaries[0], "metricSamples"), false);

  const samples = await repository.getMetricSamples(session.id);
  assert.equal(samples.length, 1);

  await repository.deleteSession(session.id);
  assert.equal(await repository.getSessionById(session.id), null);
  assert.deepEqual(await repository.getMetricSamples(session.id), []);
});

test("indexeddb repository factory exposes the repository contract without opening storage", () => {
  const repository = createIndexedDbSessionRepository();
  const contract = validateSessionRepositoryContract(repository);

  assert.equal(contract.valid, true);
  assert.equal(INDEXED_DB_SESSION_DATABASE.name, "aegismind-session-data");
  assert.equal(INDEXED_DB_SESSION_DATABASE.version, 1);
  assert.equal(INDEXED_DB_SESSION_DATABASE.stores.sessions, "study_sessions");
  assert.equal(INDEXED_DB_SESSION_DATABASE.stores.samples, "metric_samples");
});

test("completed sessions and newest sorting support future history browsing", () => {
  const oldSession = createStudySession({ id: "old", startedAt: "2026-01-01T00:00:00.000Z", createdAt: baseTime, updatedAt: baseTime }, { now: () => baseTime });
  const newSession = createStudySession({ id: "new", startedAt: "2026-01-02T00:00:00.000Z", createdAt: baseTime, updatedAt: "2026-01-02T01:00:00.000Z" }, { now: () => baseTime });
  const completed = createCompletedStudySession(newSession, {
    endedAt: "2026-01-02T01:00:00.000Z",
    statistics: calculateSessionStatistics([], newSession),
    summary: generateSessionSummary({ statistics: calculateSessionStatistics([], newSession), now: () => baseTime }),
    sampleCount: 0,
    dataCoverage: 0,
  });

  assert.equal(completed.status, SESSION_STATUS.COMPLETED);
  assert.equal(sortSessionsByNewest([oldSession, completed])[0].id, "new");
});

test("new sessions receive questionnaire defaults without fabricated answers", () => {
  const session = createStudySession({
    id: "self-report-defaults",
    taskDescription: "Read chapter 8",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
  }, { now: () => baseTime });

  assert.equal(session.taskName, "Read chapter 8");
  assert.equal(session.preSessionCheckIn.expectedDifficulty, null);
  assert.equal(session.preSessionCheckIn.mood, null);
  assert.deepEqual(session.postSessionCheckOut.strategiesUsed, []);
  assert.equal(session.postSessionCheckOut.sessionEnergy, null);
  assert.equal(session.questionnaireSchemaVersion, 1);
});

test("older sessions normalize with missing self-report fields left blank", () => {
  const normalized = normalizeStudySession({
    id: "older-session",
    taskDescription: "Legacy session",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    status: SESSION_STATUS.COMPLETED,
    endedAt: baseTime,
    actualDurationMs: 1000,
    monitoredDurationMs: 1000,
    dataCoverage: 0,
  });

  assert.equal(normalized.taskName, "Legacy session");
  assert.equal(normalized.preSessionCheckIn.taskConfidence, null);
  assert.equal(normalized.postSessionCheckOut.primaryLearningActivity, null);
  assert.deepEqual(normalized.postSessionCheckOut.strategiesUsed, []);
});

test("invalid self-report values fail safely instead of becoming neutral defaults", () => {
  const session = normalizeStudySession({
    id: "invalid-self-report",
    taskDescription: "Invalid values",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    preSessionCheckIn: {
      expectedDifficulty: 99,
      mood: 3,
    },
    postSessionCheckOut: {
      strategiesUsed: ["none_or_unsure", "rehearsal"],
      primaryStrategy: "rehearsal",
      primaryStrategyEffectiveness: 4,
      primaryLearningActivity: "bad-value",
    },
  });

  assert.equal(session.preSessionCheckIn.expectedDifficulty, null);
  assert.equal(session.preSessionCheckIn.mood, 3);
  assert.deepEqual(session.postSessionCheckOut.strategiesUsed, ["none_or_unsure"]);
  assert.equal(session.postSessionCheckOut.primaryStrategy, null);
  assert.equal(session.postSessionCheckOut.primaryStrategyEffectiveness, null);
  assert.equal(session.postSessionCheckOut.primaryLearningActivity, null);
  assert.equal(validateStudySession(session).valid, true);
});

test("post-session reflection normalization preserves partial answers", () => {
  const reflection = normalizePostSessionCheckOut({
    sessionEnergy: 4,
    perceivedAttention: 5,
    strategiesUsed: ["rehearsal", "organization"],
    primaryStrategy: "organization",
    primaryStrategyEffectiveness: 4,
    learningReflection: "  Finished chapter notes.  ",
    nextSessionAdjustment: "   ",
    recordedAt: baseTime,
  });

  assert.equal(reflection.sessionEnergy, 4);
  assert.equal(reflection.sessionMood, null);
  assert.deepEqual(reflection.strategiesUsed, ["rehearsal", "organization"]);
  assert.equal(reflection.primaryStrategy, "organization");
  assert.equal(reflection.learningReflection, "Finished chapter notes.");
  assert.equal(reflection.nextSessionAdjustment, null);
});

const selfReportSession = (overrides = {}) => ({
  id: "self-report-analysis",
  status: SESSION_STATUS.COMPLETED,
  taskName: "Read chapter 8",
  taskDescription: "Read chapter 8",
  subject: "computer_science",
  taskType: "reading",
  sessionGoal: "Understand dynamic programming examples.",
  targetDurationMs: 45 * 60000,
  actualDurationMs: 42 * 60000,
  preSessionCheckIn: {
    expectedDifficulty: 3,
    taskConfidence: 4,
    mood: 3,
    energy: 2,
    taskValue: 5,
  },
  postSessionCheckOut: {
    sessionEnergy: 3,
    sessionMood: 4,
    perceivedFatigue: 2,
    perceivedAttention: 4,
    perceivedDifficulty: 4,
    goalAttainment: 4,
    strategiesUsed: ["rehearsal", "organization", "elaboration"],
    primaryStrategy: "organization",
    primaryStrategyEffectiveness: 5,
    primaryLearningActivity: "generated_new_understanding",
    learningReflection: "The recurrence relation is clearer now.",
    nextSessionAdjustment: "Practice two more examples.",
  },
  ...overrides,
});

const signalComparisonSession = (overrides = {}) => selfReportSession({
  id: "signal-comparison",
  dataCoverage: 0.82,
  statistics: {
    attention: { mean: 78 },
    fatigue: { mean: 22 },
    valence: { mean: -0.25 },
    arousal: { mean: 0.6 },
  },
  postSessionCheckOut: {
    sessionEnergy: 3,
    sessionMood: 4,
    perceivedFatigue: 2,
    perceivedAttention: 5,
  },
  ...overrides,
});

const collectObjectKeys = (value) => {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectObjectKeys);
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectObjectKeys(nested)]);
};

const summaryStatistics = (overrides = {}) => ({
  dataCoverage: 0.72,
  attention: { mean: 76 },
  fatigue: { mean: 24 },
  valence: { mean: 0.15 },
  arousal: { mean: -0.1 },
  ...overrides,
});

const summaryEvidenceItems = (summary) => Object.values(summary)
  .filter((value) => value && typeof value === "object" && Array.isArray(value.evidence))
  .flatMap((section) => section.evidence);

test("evidence-aware summary v2 maps session records, learner reports, model observations, and limitations", () => {
  const summary = generateSessionSummary({
    statistics: summaryStatistics({ dataCoverage: 0.4 }),
    session: selfReportSession(),
    now: () => baseTime,
  });
  const sections = selectSessionSummarySections({
    status: SESSION_STATUS.COMPLETED,
    summary,
  });
  const presentation = selectSessionSummaryPresentation({
    status: SESSION_STATUS.COMPLETED,
    summary,
  });
  const evidenceTypes = new Set(summaryEvidenceItems(summary).map((item) => item.type));

  assert.equal(summary.summaryVersion, 2);
  assert.equal(summary.algorithmVersion, SESSION_SUMMARY_ALGORITHM_VERSION);
  assert.equal(presentation.interpretiveBoundary.title, "Interpretive boundary");
  assert.deepEqual(presentation.interpretiveBoundary.evidence.map((item) => item.type), [
    SUMMARY_EVIDENCE_TYPE.CAUTIOUS_INTERPRETATION,
  ]);
  assert.match(presentation.interpretiveBoundary.evidence[0].message, /descriptive context|provide context/i);
  assert.match(presentation.interpretiveBoundary.evidence[0].message, /does not establish clinical conclusions/i);
  assert.match(presentation.interpretiveBoundary.evidence[0].message, /stable personal patterns/i);
  assert.match(presentation.interpretiveBoundary.evidence[0].message, /future performance/i);
  assert.match(presentation.interpretiveBoundary.evidence[0].message, /which evidence source is correct/i);
  assert.deepEqual(sections.map((item) => item.key), [
    "goalOutcome",
    "experienceDifficulty",
    "observedStudySignals",
    "learningApproach",
    "reflectionNextSession",
  ]);
  assert.equal(sections.length, 5);
  assert.equal(sections.some((item) => item.key === "overallStatus"), false);
  assert.equal(evidenceTypes.has(SUMMARY_EVIDENCE_TYPE.SESSION_RECORD), true);
  assert.equal(evidenceTypes.has(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT), true);
  assert.equal(evidenceTypes.has(SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION), true);
  assert.equal(evidenceTypes.has(SUMMARY_EVIDENCE_TYPE.CAUTIOUS_INTERPRETATION), true);
  assert.equal(evidenceTypes.has(SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION), true);
});

test("evidence-aware summary preserves goal, outcome, custom labels, and stored model scales", () => {
  const summary = generateSessionSummary({
    statistics: summaryStatistics({
      attention: { mean: 0 },
      fatigue: { mean: Number.NaN },
      valence: { mean: null },
      arousal: { mean: 0 },
    }),
    session: selfReportSession({
      subject: "other",
      customSubject: "Astronomy lab",
      taskType: "other",
      customTaskType: "Poster critique",
    }),
    now: () => baseTime,
  });
  const goalEvidence = summary.goalOutcome.evidence;
  const observedText = JSON.stringify(summary.observedStudySignals);

  assert.ok(goalEvidence.some((item) => item.label === "Subject" && /Astronomy lab/.test(item.message)));
  assert.ok(goalEvidence.some((item) => item.label === "Task type" && /Poster critique/.test(item.message)));
  assert.ok(goalEvidence.some((item) => item.label === "Goal attainment" && /4\/5/.test(item.message)));
  assert.match(observedText, /0%/);
  assert.match(observedText, /0\.00/);
  assert.ok(summary.observedStudySignals.evidence.some((item) => (
    item.type === SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION
    && /0%|0\.00/.test(item.message)
  )));
  assert.doesNotMatch(observedText, /NaN|undefined|Infinity/);
});

test("evidence-aware summary includes difficulty context only when both ratings exist", () => {
  const paired = generateSessionSummary({
    statistics: null,
    session: selfReportSession({
      preSessionCheckIn: { expectedDifficulty: 4 },
      postSessionCheckOut: { perceivedDifficulty: 2 },
    }),
    now: () => baseTime,
  });
  const oneSided = generateSessionSummary({
    statistics: null,
    session: selfReportSession({
      preSessionCheckIn: { expectedDifficulty: 4 },
      postSessionCheckOut: { perceivedDifficulty: null },
    }),
    now: () => baseTime,
  });

  assert.ok(paired.experienceDifficulty.evidence.some((item) => (
    item.type === SUMMARY_EVIDENCE_TYPE.CAUTIOUS_INTERPRETATION
    && /easier than expected/i.test(item.message)
  )));
  assert.equal(oneSided.experienceDifficulty.evidence.some((item) => item.label === "Difficulty context"), false);
});

test("evidence-aware summary handles self-report-only and observed-only sessions descriptively", () => {
  const selfReportOnly = generateSessionSummary({
    statistics: null,
    session: selfReportSession(),
    now: () => baseTime,
  });
  const observedOnly = generateSessionSummary({
    statistics: summaryStatistics(),
    session: {
      id: "observed-only",
      status: SESSION_STATUS.COMPLETED,
    },
    now: () => baseTime,
  });

  assert.ok(selfReportOnly.goalOutcome);
  assert.ok(selfReportOnly.learningApproach);
  assert.ok(selfReportOnly.reflectionNextSession);
  assert.ok(selfReportOnly.observedStudySignals.evidence.some((item) => item.type === SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION));
  assert.ok(observedOnly.observedStudySignals.evidence.some((item) => item.type === SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION));
  assert.ok(observedOnly.experienceDifficulty.evidence.some((item) => (
    item.type === SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION
    && /No learner-reported experience ratings/i.test(item.message)
  )));
});

test("evidence-aware summary preserves factual metadata without treating empty statistics as model evidence", () => {
  const metadataOnly = generateSessionSummary({
    statistics: {
      dataCoverage: 0,
      attention: { mean: null },
      fatigue: { mean: null },
      valence: { mean: null },
      arousal: { mean: null },
    },
    session: {
      id: "metadata-only",
      status: SESSION_STATUS.COMPLETED,
      taskName: "Review proofs",
    },
    now: () => baseTime,
  });
  const observedEvidence = metadataOnly.observedStudySignals.evidence;

  assert.ok(metadataOnly.goalOutcome.evidence.some((item) => (
    item.type === SUMMARY_EVIDENCE_TYPE.SESSION_RECORD
    && /Review proofs/.test(item.message)
  )));
  assert.ok(observedEvidence.every((item) => item.type === SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION));
  assert.doesNotMatch(JSON.stringify(metadataOnly), /NaN|undefined|Infinity/);
});

test("finite model statistics with missing coverage remain useful and add a coverage limitation", () => {
  const summary = generateSessionSummary({
    statistics: {
      attention: { mean: 0 },
      fatigue: { mean: 25 },
      valence: { mean: 0 },
      arousal: { mean: -0.2 },
    },
    session: {
      id: "model-no-coverage",
      status: SESSION_STATUS.COMPLETED,
    },
    now: () => baseTime,
  });
  const observedEvidence = summary.observedStudySignals.evidence;

  assert.ok(observedEvidence.some((item) => item.label === "Coverage unavailable"));
  assert.ok(observedEvidence.some((item) => (
    item.type === SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION
    && /0%/.test(item.message)
  )));
  assert.ok(observedEvidence.some((item) => (
    item.type === SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION
    && /0\.00/.test(item.message)
  )));
});

test("skipped reflection remains a neutral limitation in evidence-aware summaries", () => {
  const summary = generateSessionSummary({
    statistics: summaryStatistics(),
    session: selfReportSession({
      postSessionCheckOut: {
        sessionEnergy: null,
        sessionMood: null,
        perceivedFatigue: null,
        perceivedAttention: null,
        perceivedDifficulty: null,
        goalAttainment: null,
        strategiesUsed: [],
        primaryStrategy: null,
        primaryStrategyEffectiveness: null,
        primaryLearningActivity: null,
        learningReflection: null,
        nextSessionAdjustment: null,
      },
    }),
    now: () => baseTime,
  });
  const reflectionText = JSON.stringify(summary.reflectionNextSession);

  assert.match(reflectionText, /No learner reflection or next-session adjustment was saved/i);
  assert.doesNotMatch(reflectionText, /fail|failure|disengaged|poor performance/i);
});

test("strategy evidence remains neutral and does not duplicate the primary strategy as another strategy", () => {
  const summary = generateSessionSummary({
    statistics: null,
    session: selfReportSession({
      postSessionCheckOut: {
        strategiesUsed: ["none_or_unsure", "organization", "rehearsal"],
        primaryStrategy: "organization",
        primaryStrategyEffectiveness: 4,
        primaryLearningActivity: "reviewed_material",
      },
    }),
    now: () => baseTime,
  });
  const otherStrategyEvidence = summary.learningApproach.evidence.find((item) => item.label === "Other strategies");

  assert.match(JSON.stringify(summary.learningApproach), /no negative judgment/i);
  assert.ok(otherStrategyEvidence);
  assert.doesNotMatch(otherStrategyEvidence.message, /Organization/i);
});

test("evidence-aware summary returns one neutral unavailable section when no usable evidence exists", () => {
  const summary = generateSessionSummary({
    statistics: null,
    session: {},
    now: () => baseTime,
  });
  const sections = selectSessionSummarySections({
    status: SESSION_STATUS.COMPLETED,
    summary,
  });

  assert.equal(summary.summaryVersion, 2);
  assert.deepEqual(sections.map((item) => item.key), ["summaryUnavailable"]);
  assert.match(sections[0].section.message, /does not contain enough saved evidence/i);
});

test("data coverage alone is not substantive evidence for Summary v2", () => {
  const summaries = [
    generateSessionSummary({
      statistics: {},
      session: {},
      now: () => baseTime,
    }),
    generateSessionSummary({
      statistics: {
        dataCoverage: 0,
        attention: { mean: null },
        fatigue: { mean: null },
        valence: { mean: Number.NaN },
        arousal: { mean: Number.POSITIVE_INFINITY },
      },
      session: {},
      now: () => baseTime,
    }),
  ];

  summaries.forEach((summary) => {
    const sections = selectSessionSummarySections({
      status: SESSION_STATUS.COMPLETED,
      summary,
    });
    assert.deepEqual(sections.map((item) => item.key), ["summaryUnavailable"]);
    assert.equal(summary.observedStudySignals, undefined);
    assert.equal(summary.experienceDifficulty, undefined);
    assert.doesNotMatch(JSON.stringify(summary), /NaN|undefined|Infinity/);
  });
});

test("summary presentation distinguishes v2, legacy, missing, and provisional summaries without mutation", () => {
  const v2Summary = generateSessionSummary({
    statistics: summaryStatistics(),
    session: selfReportSession(),
    now: () => baseTime,
  });
  const legacySummary = {
    algorithmVersion: "session-summary-v1",
    behavioralEngagement: {
      title: "Behavioral engagement",
      message: "Legacy saved summary.",
      confidence: "moderate",
    },
  };
  const legacySession = {
    id: "legacy-summary",
    status: SESSION_STATUS.COMPLETED,
    summary: legacySummary,
    summaryAlgorithmVersion: "session-summary-v1",
  };
  const before = JSON.stringify(legacySession);

  const v2Presentation = selectSessionSummaryPresentation({
    status: SESSION_STATUS.COMPLETED,
    summary: v2Summary,
  });
  const legacyPresentation = selectSessionSummaryPresentation(legacySession);
  const missingPresentation = selectSessionSummaryPresentation({ status: SESSION_STATUS.COMPLETED });
  const activePresentation = selectSessionSummaryPresentation({
    status: SESSION_STATUS.ACTIVE,
    summary: v2Summary,
  });
  const pausedPresentation = selectSessionSummaryPresentation({
    status: SESSION_STATUS.PAUSED,
    summary: v2Summary,
  });

  assert.equal(v2Presentation.kind, "evidence-aware");
  assert.ok(v2Presentation.interpretiveBoundary);
  assert.equal(legacyPresentation.kind, "legacy");
  assert.equal(legacyPresentation.interpretiveBoundary, null);
  assert.deepEqual(selectSessionSummarySections(legacySession).map((item) => item.key), ["behavioralEngagement"]);
  assert.equal(JSON.stringify(legacySession), before);
  assert.equal(missingPresentation.kind, "unknown");
  assert.equal(missingPresentation.interpretiveBoundary, null);
  assert.equal(activePresentation.kind, "provisional");
  assert.equal(activePresentation.interpretiveBoundary, null);
  assert.deepEqual(pausedPresentation.sections, []);
  assert.equal(pausedPresentation.interpretiveBoundary, null);
});

test("evidence-aware summary contains no comparison scores or causal diagnostic claims", () => {
  const summary = generateSessionSummary({
    statistics: summaryStatistics(),
    session: selfReportSession(),
    now: () => baseTime,
  });
  const keys = collectObjectKeys(summary);
  const forbiddenKeys = [
    "agreement",
    "alignment",
    "delta",
    "difference",
    "normalizedScore",
    "compositeScore",
    "discrepancy",
  ];

  forbiddenKeys.forEach((key) => {
    assert.equal(keys.includes(key), false);
  });
  assert.doesNotMatch(JSON.stringify(summary), /diagnos|objective assessment|ground truth|this caused|because of the learner|agreement score|alignment score|composite learning score/i);
});

test("evidence-aware summary generation is deterministic for the same saved inputs", () => {
  const session = selfReportSession();
  const sessionBefore = JSON.stringify(session);
  const input = {
    statistics: summaryStatistics(),
    session,
    now: () => baseTime,
  };
  const summary = generateSessionSummary(input);
  const summaryBefore = JSON.stringify(summary);

  assert.deepEqual(summary, generateSessionSummary(input));
  selectSessionSummaryPresentation({
    status: SESSION_STATUS.COMPLETED,
    summary,
  });
  assert.equal(JSON.stringify(session), sessionBefore);
  assert.equal(JSON.stringify(summary), summaryBefore);
});

const patternSession = (id, overrides = {}) => ({
  id,
  status: SESSION_STATUS.COMPLETED,
  taskName: `Session ${id}`,
  taskDescription: `Session ${id}`,
  startedAt: `2026-01-0${id}T09:00:00.000Z`,
  endedAt: `2026-01-0${id}T10:00:00.000Z`,
  actualDurationMs: id * 60000,
  targetDurationMs: 90 * 60000,
  subject: "mathematics",
  taskType: "review",
  postSessionCheckOut: {},
  preSessionCheckIn: {},
  ...overrides,
});

test("long-term patterns report empty, building, and available eligibility states", () => {
  const empty = selectLongTermSessionPatterns([]);
  const building = selectLongTermSessionPatterns([
    patternSession(1),
    patternSession(2),
    patternSession(3, { status: SESSION_STATUS.ACTIVE }),
    patternSession(4, { status: SESSION_STATUS.PAUSED }),
  ]);
  const available = selectLongTermSessionPatterns([
    patternSession(1),
    patternSession(2),
    patternSession(3),
  ]);

  assert.equal(empty.status, "empty");
  assert.equal(empty.eligibility.completedSessionCount, 0);
  assert.equal(building.status, "building");
  assert.equal(building.eligibility.completedSessionCount, 2);
  assert.equal(available.status, "available");
  assert.equal(available.eligibility.completedSessionCount, 3);
});

test("long-term overview uses valid actual durations and chronological start timestamps without mutation", () => {
  const sessions = [
    patternSession(3, { startedAt: "bad-date", actualDurationMs: 20 * 60000 }),
    patternSession(1, { startedAt: "2026-01-03T09:00:00.000Z", actualDurationMs: 0, targetDurationMs: 99 * 60000 }),
    patternSession(2, { startedAt: "2026-01-01T09:00:00.000Z", actualDurationMs: 40 * 60000 }),
    patternSession(4, { startedAt: "2026-01-02T09:00:00.000Z", actualDurationMs: Number.NaN, targetDurationMs: 120 * 60000 }),
  ];
  const before = JSON.stringify(sessions);
  const model = selectLongTermSessionPatterns(sessions);

  assert.equal(model.overview.totalStudyDuration, 60 * 60000);
  assert.equal(model.overview.medianSessionDuration, 20 * 60000);
  assert.equal(model.overview.sessionsWithValidDuration, 3);
  assert.equal(model.overview.dateRange.start, "2026-01-01T09:00:00.000Z");
  assert.equal(model.overview.dateRange.end, "2026-01-03T09:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(model), /Invalid Date|NaN|Infinity/);
  assert.equal(JSON.stringify(sessions), before);
});

test("long-term context breakdowns preserve custom labels, classify dayparts, and avoid single winners on ties", () => {
  assert.deepEqual(classifySessionDaypart("2026-01-01T05:00:00.000"), { key: "morning", label: "Morning" });
  assert.deepEqual(classifySessionDaypart("2026-01-01T12:00:00.000"), { key: "afternoon", label: "Afternoon" });
  assert.deepEqual(classifySessionDaypart("2026-01-01T17:00:00.000"), { key: "evening", label: "Evening" });
  assert.deepEqual(classifySessionDaypart("2026-01-01T22:00:00.000"), { key: "night", label: "Night" });
  assert.deepEqual(classifySessionDaypart("2026-01-01T04:59:00.000"), { key: "night", label: "Night" });

  const model = selectLongTermSessionPatterns([
    patternSession(1, {
      startedAt: "2026-01-01T05:00:00.000",
      subject: "other",
      customSubject: "Very Long Custom Subject Label That Should Remain Intact",
      taskType: "other",
      customTaskType: "Custom Research Memo",
      postSessionCheckOut: { strategiesUsed: ["none_or_unsure"], primaryStrategy: null },
    }),
    patternSession(2, {
      startedAt: "2026-01-01T12:00:00.000",
      subject: "physics",
      taskType: "reading",
      postSessionCheckOut: { strategiesUsed: ["organization"], primaryStrategy: "organization" },
    }),
    patternSession(3, {
      startedAt: "2026-01-01T17:00:00.000",
      subject: "physics",
      taskType: "reading",
      postSessionCheckOut: { strategiesUsed: ["organization"], primaryStrategy: "organization" },
    }),
    patternSession(4, {
      startedAt: "2026-01-01T22:00:00.000",
      subject: "mathematics",
      taskType: "review",
    }),
    patternSession(5, {
      startedAt: "2026-01-02T05:00:00.000",
      subject: "mathematics",
      taskType: "review",
    }),
  ]);

  assert.ok(model.contextBreakdowns.subjects.rows.some((row) => row.label === "Very Long Custom Subject Label That Should Remain Intact"));
  assert.ok(model.contextBreakdowns.taskTypes.rows.some((row) => row.label === "Custom Research Memo"));
  assert.equal(model.contextBreakdowns.dayparts.mostFrequent, null);
  assert.ok(model.contextBreakdowns.primaryStrategies.rows.some((row) => row.key === "none_or_unsure" && row.label === "None / Not sure"));
});

test("long-term learner history uses median ratings on the 1-5 scale and omits sparse metrics", () => {
  const model = selectLongTermSessionPatterns([
    patternSession(1, { postSessionCheckOut: { goalAttainment: 1, perceivedAttention: 0, sessionMood: null } }),
    patternSession(2, { postSessionCheckOut: { goalAttainment: 5, sessionMood: 4 } }),
    patternSession(3, { postSessionCheckOut: { goalAttainment: 3, sessionMood: 5 } }),
    patternSession(4, { postSessionCheckOut: { goalAttainment: null, sessionMood: 3 } }),
  ]);
  const goal = model.learnerReported.metrics.find((metric) => metric.key === "goalAttainment");
  const attention = model.learnerReported.metrics.find((metric) => metric.key === "perceivedAttention");
  const mood = model.learnerReported.metrics.find((metric) => metric.key === "sessionMood");

  assert.equal(goal.medianRating, 3);
  assert.equal(goal.responseCount, 3);
  assert.equal(goal.scaleLabel, "1-5 learner rating");
  assert.equal(attention, undefined);
  assert.equal(mood.medianRating, 4);
  assert.deepEqual(model.learnerReported.series.goalAttainment.map((point) => point.value), [1, 5, 3]);
});

test("long-term model history uses persisted statistics, keeps scales, and preserves finite zero values", () => {
  const model = selectLongTermSessionPatterns([
    patternSession(1, { statistics: { attention: { mean: 0 }, fatigue: { mean: 10 }, valence: { mean: 0 }, arousal: { mean: 0.2 }, dataCoverage: 0.5 } }),
    patternSession(2, { statistics: { attention: { mean: 50 }, fatigue: { mean: 20 }, valence: { mean: 0.5 }, arousal: { mean: 0.4 }, dataCoverage: 0.6 } }),
    patternSession(3, { statistics: { attention: { mean: 100 }, fatigue: { mean: 30 }, valence: { mean: -0.5 }, arousal: { mean: 0 }, dataCoverage: 0.7 } }),
    patternSession(4, { statistics: { attention: { mean: Number.NaN }, fatigue: { mean: null }, valence: { mean: Infinity }, arousal: { mean: undefined }, dataCoverage: 0.8 } }),
  ]);
  const attention = model.modelObserved.metrics.find((metric) => metric.key === "attention");
  const valence = model.modelObserved.metrics.find((metric) => metric.key === "valence");

  assert.equal(attention.meanValue, 50);
  assert.equal(attention.sessionCount, 3);
  assert.equal(attention.scaleLabel, "0-100 estimated signal");
  assert.deepEqual(model.modelObserved.series.attention.map((point) => point.value), [0, 50, 100]);
  assert.equal(valence.meanValue, 0);
  assert.equal(valence.scaleLabel, "-1 to 1 estimated signal");
  assert.doesNotMatch(JSON.stringify(model), /NaN|Infinity/);
});

test("zero coverage blocks model patterns while missing coverage remains distinguishable", () => {
  const zeroCoverage = selectLongTermSessionPatterns([
    patternSession(1, { dataCoverage: 0, statistics: { attention: { mean: 0 } } }),
    patternSession(2, { dataCoverage: 0, statistics: { attention: { mean: 50 } } }),
    patternSession(3, { dataCoverage: 0, statistics: { attention: { mean: 100 } } }),
  ]);
  const missingCoverage = selectLongTermSessionPatterns([
    patternSession(1, { dataCoverage: null, statistics: { attention: { mean: 0 } } }),
    patternSession(2, { dataCoverage: null, statistics: { attention: { mean: 50 } } }),
    patternSession(3, { dataCoverage: null, statistics: { attention: { mean: 100 } } }),
  ]);

  assert.deepEqual(zeroCoverage.modelObserved.metrics, []);
  assert.equal(zeroCoverage.modelObserved.coverage.zeroCoverageCount, 3);
  assert.equal(missingCoverage.modelObserved.metrics.find((metric) => metric.key === "attention").meanValue, 50);
  assert.equal(missingCoverage.modelObserved.coverage.unknownCount, 3);
  assert.equal(missingCoverage.modelObserved.coverage.knownCount, 0);
});

test("coverage alone and missing statistics do not remove useful session-record or learner history", () => {
  const recordOnly = selectLongTermSessionPatterns([
    patternSession(1, { dataCoverage: 0 }),
    patternSession(2, { dataCoverage: 0 }),
    patternSession(3, { dataCoverage: 0 }),
  ]);
  const learnerOnly = selectLongTermSessionPatterns([
    patternSession(1, { postSessionCheckOut: { perceivedFatigue: 1 } }),
    patternSession(2, { postSessionCheckOut: { perceivedFatigue: 3 } }),
    patternSession(3, { postSessionCheckOut: { perceivedFatigue: 5 } }),
  ]);

  assert.equal(recordOnly.status, "available");
  assert.equal(recordOnly.contextBreakdowns.subjects.rows.length > 0, true);
  assert.deepEqual(recordOnly.modelObserved.metrics, []);
  assert.equal(learnerOnly.learnerReported.metrics.find((metric) => metric.key === "perceivedFatigue").medianRating, 3);
  assert.deepEqual(learnerOnly.modelObserved.metrics, []);
});

test("long-term patterns contain no combined scores, deltas, correlations, predictions, or composite fields", () => {
  const model = selectLongTermSessionPatterns([
    patternSession(1, { postSessionCheckOut: { goalAttainment: 1 }, statistics: { attention: { mean: 0 }, dataCoverage: 0.5 } }),
    patternSession(2, { postSessionCheckOut: { goalAttainment: 3 }, statistics: { attention: { mean: 50 }, dataCoverage: 0.5 } }),
    patternSession(3, { postSessionCheckOut: { goalAttainment: 5 }, statistics: { attention: { mean: 100 }, dataCoverage: 0.5 } }),
  ]);
  const keys = collectObjectKeys(model);
  const forbiddenKeys = [
    "agreement",
    "alignment",
    "delta",
    "difference",
    "normalizedScore",
    "compositeScore",
    "discrepancy",
    "correlation",
    "regression",
    "prediction",
  ];

  forbiddenKeys.forEach((key) => {
    assert.equal(keys.includes(key), false);
  });
  assert.equal(new Set(model.modelObserved.series.attention.map((point) => point.sessionId)).size, 3);
  assert.doesNotMatch(JSON.stringify(model), /agreement score|alignment score|correlation|regression|prediction|composite learning score|best study time|best strategy/i);
});

test("long-term pattern derivation is deterministic and does not mutate input", () => {
  const sessions = [
    patternSession(2, { postSessionCheckOut: { goalAttainment: 5 } }),
    patternSession(1, { postSessionCheckOut: { goalAttainment: 1 } }),
    patternSession(3, { postSessionCheckOut: { goalAttainment: 3 } }),
  ];
  const before = JSON.stringify(sessions);

  assert.deepEqual(selectLongTermSessionPatterns(sessions), selectLongTermSessionPatterns(sessions));
  assert.equal(JSON.stringify(sessions), before);
});

test("learner-observed comparison maps full learner report to persisted session statistics", () => {
  const comparison = selectLearnerObservedSignalComparison(signalComparisonSession());

  assert.equal(comparison.available, true);
  assert.equal(comparison.dataCoverage, 0.82);
  assert.deepEqual(comparison.rows.map((row) => row.key), ["attention", "fatigue", "moodValence", "energyArousal"]);

  const attention = comparison.rows.find((row) => row.key === "attention");
  const fatigue = comparison.rows.find((row) => row.key === "fatigue");
  const mood = comparison.rows.find((row) => row.key === "moodValence");
  const energy = comparison.rows.find((row) => row.key === "energyArousal");

  assert.equal(attention.learner.label, "Perceived attention");
  assert.equal(attention.learner.value, 5);
  assert.equal(attention.model.label, "Estimated attention average");
  assert.equal(attention.model.value, 78);
  assert.equal(fatigue.learner.value, 2);
  assert.equal(fatigue.model.value, 22);
  assert.equal(mood.learner.value, 4);
  assert.equal(mood.model.value, -0.25);
  assert.equal(energy.learner.value, 3);
  assert.equal(energy.model.value, 0.6);
});

test("learner ratings and model statistics keep their original scales", () => {
  const comparison = selectLearnerObservedSignalComparison(signalComparisonSession());
  const attention = comparison.rows.find((row) => row.key === "attention");
  const mood = comparison.rows.find((row) => row.key === "moodValence");

  assert.equal(attention.learner.valueKind, "rating");
  assert.equal(attention.learner.scaleLabel, "1-5 learner rating");
  assert.equal(attention.model.valueKind, "percentage");
  assert.equal(attention.model.scaleLabel, "0-100 estimated signal");
  assert.equal(attention.model.value > 5, true);
  assert.equal(mood.model.valueKind, "affect");
  assert.equal(mood.model.scaleLabel, "-1 to 1 estimated signal");
  assert.equal(mood.model.value, -0.25);
});

test("finite zero model statistics are preserved as valid paired values", () => {
  const comparison = selectLearnerObservedSignalComparison(signalComparisonSession({
    statistics: {
      attention: { mean: 0 },
      fatigue: { mean: 0 },
      valence: { mean: 0 },
      arousal: { mean: 0 },
    },
  }));

  assert.equal(comparison.rows.length, 4);
  assert.ok(comparison.rows.every((row) => row.availability === "paired"));
  assert.ok(comparison.rows.every((row) => row.model.value === 0));
});

test("learner-only comparison rows do not fabricate model values", () => {
  const comparison = selectLearnerObservedSignalComparison(signalComparisonSession({
    statistics: {
      attention: { mean: Number.NaN },
      fatigue: { mean: null },
      valence: {},
      arousal: { mean: Number.POSITIVE_INFINITY },
    },
  }));

  assert.equal(comparison.rows.length, 4);
  assert.ok(comparison.rows.every((row) => row.availability === "learner-only"));
  assert.ok(comparison.rows.every((row) => row.model.value === null));
  assert.ok(comparison.rows.every((row) => /unavailable/i.test(row.model.unavailableMessage)));
});

test("missing learner fields do not generate model-only comparison rows", () => {
  const comparison = selectLearnerObservedSignalComparison(signalComparisonSession({
    postSessionCheckOut: {
      perceivedAttention: 4,
      perceivedFatigue: null,
      sessionMood: null,
      sessionEnergy: null,
    },
  }));

  assert.deepEqual(comparison.rows.map((row) => row.key), ["attention"]);
  assert.equal(comparison.rows[0].model.value, 78);
});

test("partial learner responses produce only relevant comparison constructs", () => {
  const comparison = selectLearnerObservedSignalComparison(signalComparisonSession({
    postSessionCheckOut: {
      perceivedAttention: null,
      perceivedFatigue: 3,
      sessionMood: null,
      sessionEnergy: 2,
    },
  }));

  assert.deepEqual(comparison.rows.map((row) => row.key), ["fatigue", "energyArousal"]);
});

test("finish without reflection and statistics-only sessions return empty comparison state", () => {
  const skipped = selectLearnerObservedSignalComparison(signalComparisonSession({
    postSessionCheckOut: {
      sessionEnergy: null,
      sessionMood: null,
      perceivedFatigue: null,
      perceivedAttention: null,
    },
  }));
  const statisticsOnly = selectLearnerObservedSignalComparison({
    id: "statistics-only",
    status: SESSION_STATUS.COMPLETED,
    statistics: {
      attention: { mean: 80 },
      fatigue: { mean: 20 },
      valence: { mean: 0.2 },
      arousal: { mean: 0.4 },
    },
  });

  assert.equal(skipped.available, false);
  assert.deepEqual(skipped.rows, []);
  assert.equal(statisticsOnly.available, false);
  assert.deepEqual(statisticsOnly.rows, []);
});

test("learner reports with missing statistics and older sessions stay safe", () => {
  const learnerOnly = selectLearnerObservedSignalComparison(signalComparisonSession({
    statistics: null,
  }));
  const older = selectLearnerObservedSignalComparison({
    id: "older-comparison-session",
    status: SESSION_STATUS.COMPLETED,
  });

  assert.equal(learnerOnly.available, true);
  assert.ok(learnerOnly.rows.every((row) => row.availability === "learner-only"));
  assert.equal(older.available, false);
  assert.deepEqual(older.rows, []);
});

test("active and paused sessions do not produce completed-only learner-observed comparisons", () => {
  [SESSION_STATUS.ACTIVE, SESSION_STATUS.PAUSED].forEach((status) => {
    const comparison = selectLearnerObservedSignalComparison(signalComparisonSession({ status }));

    assert.equal(comparison.available, false);
    assert.equal(comparison.eligibility, "completed-session-required");
    assert.deepEqual(comparison.rows, []);
  });
});

test("learner-observed comparison view model contains no score, delta, or agreement fields", () => {
  const comparison = selectLearnerObservedSignalComparison(signalComparisonSession());
  const keys = collectObjectKeys(comparison);
  const forbiddenKeys = [
    "agreement",
    "alignment",
    "delta",
    "difference",
    "normalizedScore",
    "compositeScore",
    "discrepancy",
  ];

  forbiddenKeys.forEach((key) => {
    assert.equal(keys.includes(key), false);
  });
  assert.doesNotMatch(JSON.stringify(comparison), /agreement score|alignment score|difference value|delta value|composite learning score/i);
});

test("complete pre/post self-report data produces a structured analysis view model", () => {
  const analysis = selectSessionSelfReportAnalysis(selfReportSession());

  assert.equal(analysis.isCompleted, true);
  assert.equal(analysis.hasPreSessionData, true);
  assert.equal(analysis.hasPostSessionReflection, true);
  assert.deepEqual(analysis.goalOutcome.contextItems.map((item) => item.key), [
    "taskName",
    "subject",
    "taskType",
    "sessionGoal",
    "targetDurationMs",
    "actualDurationMs",
  ]);
  assert.deepEqual(analysis.goalOutcome.outcomeItems.map((item) => item.key), ["goalAttainment"]);
  assert.equal(analysis.expectationExperience.difficulty.comparison.outcome, "higher");
  assert.match(analysis.expectationExperience.difficulty.comparison.caution, /not be interpreted directly as a learning gain/i);
  assert.equal(analysis.motivationalContext.available, true);
  assert.equal(analysis.learningStrategy.primaryStrategy, "organization");
  assert.deepEqual(analysis.learningStrategy.otherStrategies, ["rehearsal", "elaboration"]);
  assert.deepEqual(analysis.learningStrategy.items.map((item) => item.key), [
    "primaryStrategy",
    "primaryStrategyEffectiveness",
    "otherStrategies",
    "primaryLearningActivity",
    "learningReflection",
    "nextSessionAdjustment",
  ]);
});

test("difficulty comparison reports lower, equal, and higher experience outcomes", () => {
  const lower = selectSessionSelfReportAnalysis(selfReportSession({
    preSessionCheckIn: { expectedDifficulty: 4 },
    postSessionCheckOut: { perceivedDifficulty: 2 },
  }));
  const equal = selectSessionSelfReportAnalysis(selfReportSession({
    preSessionCheckIn: { expectedDifficulty: 3 },
    postSessionCheckOut: { perceivedDifficulty: 3 },
  }));
  const higher = selectSessionSelfReportAnalysis(selfReportSession({
    preSessionCheckIn: { expectedDifficulty: 2 },
    postSessionCheckOut: { perceivedDifficulty: 5 },
  }));

  assert.equal(lower.expectationExperience.difficulty.comparison.description, "The task felt easier than expected.");
  assert.equal(equal.expectationExperience.difficulty.comparison.description, "The experienced difficulty was close to the initial expectation.");
  assert.equal(higher.expectationExperience.difficulty.comparison.description, "The task felt harder than expected.");
});

test("pre-session-only data does not generate post-session comparison analysis", () => {
  const analysis = selectSessionSelfReportAnalysis(selfReportSession({
    preSessionCheckIn: {
      expectedDifficulty: 4,
      taskConfidence: 3,
      mood: 2,
      energy: 5,
      taskValue: 4,
    },
    postSessionCheckOut: {
      sessionEnergy: null,
      sessionMood: null,
      perceivedFatigue: null,
      perceivedAttention: null,
      perceivedDifficulty: null,
      goalAttainment: null,
      strategiesUsed: [],
      primaryStrategy: null,
      primaryStrategyEffectiveness: null,
      primaryLearningActivity: null,
      learningReflection: null,
      nextSessionAdjustment: null,
    },
  }));

  assert.equal(analysis.hasPreSessionData, true);
  assert.equal(analysis.hasPostSessionReflection, false);
  assert.equal(analysis.expectationExperience.difficulty.expected, 4);
  assert.equal(analysis.expectationExperience.difficulty.perceived, null);
  assert.equal(analysis.expectationExperience.difficulty.comparison, null);
  assert.equal(analysis.expectationExperience.confidenceGoal.goalAttainment, null);
  assert.doesNotMatch(JSON.stringify(analysis.expectationExperience), /Unavailable|NaN|0\/5|3\/5/i);
});

test("single-sided ratings stay as one saved value without fabricated paired values", () => {
  const onlyPerceived = selectSessionSelfReportAnalysis(selfReportSession({
    preSessionCheckIn: {
      expectedDifficulty: null,
      taskConfidence: null,
      mood: null,
      energy: null,
      taskValue: null,
    },
    postSessionCheckOut: {
      perceivedDifficulty: 5,
      sessionMood: 2,
      sessionEnergy: null,
      strategiesUsed: [],
    },
  }));

  assert.equal(onlyPerceived.expectationExperience.difficulty.expected, null);
  assert.equal(onlyPerceived.expectationExperience.difficulty.perceived, 5);
  assert.equal(onlyPerceived.expectationExperience.difficulty.comparison, null);
  assert.deepEqual(onlyPerceived.expectationExperience.mood, {
    beforeSession: null,
    overallSessionExperience: 2,
  });
  assert.deepEqual(onlyPerceived.expectationExperience.energy, {
    beforeSession: null,
    overallSessionExperience: null,
  });
  assert.doesNotMatch(JSON.stringify(onlyPerceived.expectationExperience), /Unavailable|NaN|improved|declined|\+1|-1|percentage change/i);
});

test("mood and energy remain before-session and overall-experience values without deltas", () => {
  const analysis = selectSessionSelfReportAnalysis(selfReportSession());

  assert.deepEqual(analysis.expectationExperience.mood, {
    beforeSession: 3,
    overallSessionExperience: 4,
  });
  assert.deepEqual(analysis.expectationExperience.energy, {
    beforeSession: 2,
    overallSessionExperience: 3,
  });
  assert.equal(Object.hasOwn(analysis.expectationExperience.mood, "delta"), false);
  assert.equal(Object.hasOwn(analysis.expectationExperience.energy, "change"), false);
  assert.doesNotMatch(JSON.stringify(analysis.expectationExperience), /improved|declined|\+1|-1|percentage change/i);
});

test("none or not sure strategy selection remains neutral without strategy cards", () => {
  const analysis = selectSessionSelfReportAnalysis(selfReportSession({
    postSessionCheckOut: {
      strategiesUsed: ["none_or_unsure"],
      primaryStrategy: null,
      primaryStrategyEffectiveness: null,
    },
  }));

  assert.equal(analysis.learningStrategy.available, true);
  assert.equal(analysis.learningStrategy.primaryStrategy, null);
  assert.deepEqual(analysis.learningStrategy.otherStrategies, []);
  assert.equal(analysis.learningStrategy.items.length, 0);
  assert.match(analysis.learningStrategy.note, /no negative judgment/i);
});

test("primary strategy is excluded from other strategies", () => {
  const analysis = selectSessionSelfReportAnalysis(selfReportSession({
    postSessionCheckOut: {
      strategiesUsed: ["organization", "elaboration", "organization", "rehearsal"],
      primaryStrategy: "organization",
      primaryStrategyEffectiveness: 4,
    },
  }));

  assert.equal(analysis.learningStrategy.primaryStrategy, "organization");
  assert.deepEqual(analysis.learningStrategy.otherStrategies, ["elaboration", "rehearsal"]);
  assert.equal(analysis.learningStrategy.otherStrategies.includes("organization"), false);
});

test("custom subject and task type values remain available in self-report analysis", () => {
  const analysis = selectSessionSelfReportAnalysis(selfReportSession({
    subject: "other",
    customSubject: "Astronomy lab",
    taskType: "other",
    customTaskType: "Poster critique",
  }));

  const subject = analysis.goalOutcome.contextItems.find((item) => item.key === "subject");
  const taskType = analysis.goalOutcome.contextItems.find((item) => item.key === "taskType");

  assert.equal(subject.value, "Astronomy lab");
  assert.equal(taskType.value, "Poster critique");
});

test("skipping the reflection returns an unavailable post-session state without failure semantics", () => {
  const analysis = selectSessionSelfReportAnalysis(selfReportSession({
    postSessionCheckOut: {
      sessionEnergy: null,
      sessionMood: null,
      perceivedFatigue: null,
      perceivedAttention: null,
      perceivedDifficulty: null,
      goalAttainment: null,
      strategiesUsed: [],
      primaryStrategy: null,
      primaryStrategyEffectiveness: null,
      primaryLearningActivity: null,
      learningReflection: null,
      nextSessionAdjustment: null,
    },
  }));

  assert.equal(analysis.hasPostSessionReflection, false);
  assert.equal(analysis.goalOutcome.outcomeItems.length, 0);
  assert.match(analysis.goalOutcome.postUnavailableMessage, /reflection was not completed/i);
  assert.doesNotMatch(analysis.goalOutcome.postUnavailableMessage, /fail|failure/i);
});

test("older sessions without self-report fields do not throw or fabricate defaults", () => {
  assert.doesNotThrow(() => selectSessionSelfReportAnalysis({
    id: "legacy",
    status: SESSION_STATUS.COMPLETED,
    taskDescription: "Legacy session",
  }));

  const analysis = selectSessionSelfReportAnalysis({
    id: "legacy",
    status: SESSION_STATUS.COMPLETED,
    taskDescription: "Legacy session",
  });
  assert.equal(analysis.hasPreSessionData, false);
  assert.equal(analysis.hasPostSessionReflection, false);
  assert.equal(analysis.initialCheckIn.items.length, 0);
  assert.equal(analysis.expectationExperience.difficulty.expected, null);
  assert.equal(analysis.expectationExperience.difficulty.perceived, null);
});

test("active and paused sessions do not produce completed-only outcome analysis", () => {
  [SESSION_STATUS.ACTIVE, SESSION_STATUS.PAUSED].forEach((status) => {
    const analysis = selectSessionSelfReportAnalysis(selfReportSession({
      status,
      accumulatedStudyMs: 5000,
    }));

    assert.equal(analysis.isCompleted, false);
    assert.equal(analysis.goalOutcome.outcomeItems.length, 0);
    assert.equal(analysis.expectationExperience.available, false);
    assert.equal(analysis.learningStrategy.available, false);
    assert.match(analysis.goalOutcome.currentSessionMessage, /after the session is completed/i);
  });
});

test("session plan normalizes legacy sessions and derives planned break count in milliseconds", () => {
  const legacy = normalizeStudySession({
    id: "legacy-no-breaks",
    taskDescription: "Legacy",
    targetDurationMs: 50 * 60000,
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
  });

  assert.deepEqual(legacy.sessionPlan, {
    targetDurationMs: 50 * 60000,
    focusDurationMs: null,
    breakDurationMs: 0,
    plannedBreakCount: 0,
  });
  assert.deepEqual(legacy.breakEvents, []);
  assert.deepEqual(legacy.interruptions, []);
  assert.equal(validateStudySession(legacy).valid, true);

  const plan = normalizeSessionPlan({
    targetDurationMs: 50 * 60000,
    focusDurationMs: 25 * 60000,
    breakDurationMs: 5 * 60000,
  });
  assert.equal(plan.plannedBreakCount, 1);
  assert.deepEqual(calculatePlannedBreakPositions(plan), [25 * 60000]);
});

test("regular break plan validation uses five-minute bounded focus and break durations", () => {
  assert.equal(isValidBreakFocusDuration(20 * 60000), false);
  assert.equal(isValidBreakFocusDuration(95 * 60000), false);
  assert.equal(isValidBreakFocusDuration(26 * 60000), false);
  assert.equal(isValidBreakFocusDuration(25 * 60000), true);
  assert.equal(isValidBreakFocusDuration(90 * 60000), true);

  assert.equal(isValidBreakDuration(4 * 60000, 30 * 60000), false);
  assert.equal(isValidBreakDuration(20 * 60000, 60 * 60000), false);
  assert.equal(isValidBreakDuration(7 * 60000, 45 * 60000), false);
  assert.equal(isValidBreakDuration(10 * 60000, 25 * 60000), false);
  assert.equal(isValidBreakDuration(10 * 60000, 30 * 60000), true);
  assert.equal(isValidBreakDuration(15 * 60000, 45 * 60000), true);

  assert.equal(coerceBreakDurationForFocus(15 * 60000, 30 * 60000), 10 * 60000);
  assert.equal(coerceBreakDurationForFocus(10 * 60000, 25 * 60000), 5 * 60000);
});

test("regular break plan normalization keeps disabled and invalid plans safe", () => {
  const disabled = normalizeSessionPlan({
    targetDurationMs: 90 * 60000,
    focusDurationMs: null,
    breakDurationMs: 0,
  });
  assert.deepEqual(disabled, {
    targetDurationMs: 90 * 60000,
    focusDurationMs: null,
    breakDurationMs: 0,
    plannedBreakCount: 0,
  });

  const corrected = normalizeSessionPlan({
    targetDurationMs: 90 * 60000,
    focusDurationMs: 26 * 60000,
    breakDurationMs: 15 * 60000,
  });
  assert.equal(corrected.focusDurationMs, 25 * 60000);
  assert.equal(corrected.breakDurationMs, 5 * 60000);
  assert.equal(corrected.plannedBreakCount, 3);

  const exactEnd = normalizeSessionPlan({
    targetDurationMs: 50 * 60000,
    focusDurationMs: 25 * 60000,
    breakDurationMs: 5 * 60000,
  });
  assert.deepEqual(calculatePlannedBreakPositions(exactEnd), [25 * 60000]);

  const tooShort = normalizeSessionPlan({
    targetDurationMs: 20 * 60000,
    focusDurationMs: 25 * 60000,
    breakDurationMs: 5 * 60000,
  });
  assert.deepEqual(calculatePlannedBreakPositions(tooShort), []);
});

test("debug break plan preserves second-based durations only with timing mode marker", () => {
  const debugPlan = normalizeSessionPlan({
    targetDurationMs: 60_000,
    focusDurationMs: 30_000,
    breakDurationMs: 10_000,
    timingMode: "debug",
  });

  assert.deepEqual(debugPlan, {
    targetDurationMs: 60_000,
    focusDurationMs: 30_000,
    breakDurationMs: 10_000,
    plannedBreakCount: 1,
    timingMode: "debug",
  });
  assert.deepEqual(calculatePlannedBreakPositions(debugPlan), [30_000]);

  const regularPlan = normalizeSessionPlan({
    targetDurationMs: 60_000,
    focusDurationMs: 30_000,
    breakDurationMs: 10_000,
  });
  assert.equal(regularPlan.timingMode, undefined);
  assert.equal(regularPlan.focusDurationMs, 25 * 60000);
  assert.equal(regularPlan.breakDurationMs, 5 * 60000);
  assert.equal(regularPlan.plannedBreakCount, 0);
});

test("debug break validation rejects unsafe second values and normalization corrects them", () => {
  assert.equal(isValidDebugBreakFocusDuration(14_000), false);
  assert.equal(isValidDebugBreakFocusDuration(601_000), false);
  assert.equal(isValidDebugBreakFocusDuration(30_500), false);
  assert.equal(isValidDebugBreakFocusDuration(30_000), true);
  assert.equal(isValidDebugBreakDuration(4_000, 30_000), false);
  assert.equal(isValidDebugBreakDuration(301_000, 900_000), false);
  assert.equal(isValidDebugBreakDuration(7_500, 30_000), false);
  assert.equal(isValidDebugBreakDuration(11_000, 30_000), false);
  assert.equal(isValidDebugBreakDuration(10_000, 30_000), true);

  assert.equal(coerceDebugBreakDurationForFocus(20_000, 30_000), 10_000);
  assert.equal(coerceDebugBreakDurationForFocus(4_000, 30_000), 5_000);

  const emptyOrNonFinite = normalizeSessionPlan({
    enabled: true,
    targetDurationMs: 60_000,
    focusDurationMs: Number.NaN,
    breakDurationMs: Number.POSITIVE_INFINITY,
    timingMode: "debug",
  });
  assert.equal(emptyOrNonFinite.focusDurationMs, 30_000);
  assert.equal(emptyOrNonFinite.breakDurationMs, 5_000);
  assert.equal(emptyOrNonFinite.timingMode, "debug");

  const corrected = normalizeSessionPlan({
    targetDurationMs: 600_000,
    focusDurationMs: 10_000,
    breakDurationMs: 600_000,
    timingMode: "debug",
  });
  assert.equal(corrected.focusDurationMs, 15_000);
  assert.equal(corrected.breakDurationMs, 5_000);
  assert.equal(corrected.timingMode, "debug");

  const fractional = normalizeSessionPlan({
    targetDurationMs: 60_000,
    focusDurationMs: 30_500,
    breakDurationMs: 7_500,
    timingMode: "debug",
  });
  assert.equal(fractional.focusDurationMs, 30_000);
  assert.equal(fractional.breakDurationMs, 10_000);
});

test("debug planned-break count still excludes exact session end", () => {
  const oneBreak = normalizeSessionPlan({
    targetDurationMs: 60_000,
    focusDurationMs: 30_000,
    breakDurationMs: 10_000,
    timingMode: "debug",
  });
  assert.deepEqual(calculatePlannedBreakPositions(oneBreak), [30_000]);

  const exactEndOnly = normalizeSessionPlan({
    targetDurationMs: 30_000,
    focusDurationMs: 30_000,
    breakDurationMs: 10_000,
    timingMode: "debug",
  });
  assert.deepEqual(calculatePlannedBreakPositions(exactEndOnly), []);
});

test("debug timing mode survives session normalization and recovery", async () => {
  const session = normalizeStudySession({
    id: "debug-plan-session",
    taskDescription: "Debug timing",
    targetDurationMs: 60_000,
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    sessionPlan: {
      targetDurationMs: 60_000,
      focusDurationMs: 30_000,
      breakDurationMs: 10_000,
      timingMode: "debug",
    },
  });
  assert.equal(session.sessionPlan.timingMode, "debug");
  assert.equal(validateStudySession(session).valid, true);

  const repository = createMemorySessionRepository();
  const runtime = createSessionRuntime({
    repository,
    now: () => baseTime,
    idFactory: () => "runtime-debug-plan",
  });
  await runtime.prepareSession({
    taskDescription: "Runtime debug timing",
    targetDurationMs: 60_000,
    sessionPlan: {
      targetDurationMs: 60_000,
      focusDurationMs: 30_000,
      breakDurationMs: 10_000,
      timingMode: "debug",
    },
  });
  await runtime.activatePreparedSession();
  await runtime.checkpointActiveSession(15_000, {
    checkpointedAt: "2026-01-01T00:00:15.000Z",
  });

  const recoveredRuntime = createSessionRuntime({
    repository,
    now: () => "2026-01-01T00:01:00.000Z",
  });
  const initialization = await recoveredRuntime.initializeSessionState();

  assert.equal(initialization.recoveredSession.sessionPlan.timingMode, "debug");
  assert.equal(initialization.recoveredSession.sessionPlan.focusDurationMs, 30_000);
  assert.equal(initialization.recoveredSession.sessionPlan.breakDurationMs, 10_000);
});

test("break lifecycle transitions prevent duplicate and overlapping active breaks", () => {
  const session = createStudySession({
    id: "break-session",
    taskDescription: "Break planning",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    breakEvents: normalizeBreakEvents([
      { id: "break-1", plannedStartElapsedMs: 25 * 60000 },
      { id: "break-2", plannedStartElapsedMs: 50 * 60000 },
    ]),
  }, { now: () => baseTime });

  const nextBreak = getNextScheduledBreak(session, 0);
  assert.equal(nextBreak.id, "break-1");

  const withActiveBreak = startPlannedBreak(session, "break-1", {
    actualStartElapsedMs: 25 * 60000,
    actualStartAt: "2026-01-01T00:25:00.000Z",
  });
  assert.equal(withActiveBreak.breakEvents[0].status, BREAK_STATUS.ACTIVE);
  assert.equal(startPlannedBreak(withActiveBreak, "break-1").breakEvents[0].status, BREAK_STATUS.ACTIVE);
  assert.throws(() => startPlannedBreak(withActiveBreak, "break-2"), /already active/i);

  const completed = completeBreak(withActiveBreak, "break-1", {
    actualEndElapsedMs: 30 * 60000,
    actualEndAt: "2026-01-01T00:30:00.000Z",
  });
  assert.equal(completed.breakEvents[0].status, BREAK_STATUS.COMPLETED);
  assert.equal(skipBreak(completed, "break-2").breakEvents[1].status, BREAK_STATUS.SKIPPED);
  assert.throws(() => cancelBreak(completed, "break-1"), /completed/i);
});

test("break extensions are counted and capped at three", () => {
  const session = createStudySession({
    id: "break-extension-session",
    taskDescription: "Break extensions",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    breakEvents: normalizeBreakEvents([
      {
        id: "break-1",
        plannedStartElapsedMs: 25 * 60000,
        status: BREAK_STATUS.ACTIVE,
        actualStartElapsedMs: 25 * 60000,
        actualStartAt: "2026-01-01T00:25:00.000Z",
        baseDurationMs: 5 * 60000,
      },
    ]),
  }, { now: () => baseTime });

  const one = startBreakExtension(session, "break-1", {
    activeSegmentStartedAt: "2026-01-01T00:30:00.000Z",
  });
  const two = startBreakExtension(one, "break-1", {
    activeSegmentStartedAt: "2026-01-01T00:33:00.000Z",
  });
  const three = startBreakExtension(two, "break-1", {
    activeSegmentStartedAt: "2026-01-01T00:36:00.000Z",
  });

  assert.equal(three.breakEvents[0].extensionCount, 3);
  assert.equal(three.breakEvents[0].totalExtensionDurationMs, 9 * 60000);
  assert.throws(
    () => startBreakExtension(three, "break-1", { activeSegmentStartedAt: "2026-01-01T00:39:00.000Z" }),
    /extension limit/i
  );
});

test("planned breaks remain distinct from manual pauses and interruptions", () => {
  const interruptions = normalizeInterruptions([
    { id: "pause-1", startElapsedMs: 1000, endElapsedMs: 2000, reason: INTERRUPTION_REASON.MANUAL_PAUSE },
    { id: "bad-reason", start: 3000, end: 4000, reason: "unknown" },
  ]);

  assert.equal(interruptions[0].reason, INTERRUPTION_REASON.MANUAL_PAUSE);
  assert.equal(interruptions[1].reason, INTERRUPTION_REASON.MANUAL_PAUSE);

  const session = normalizeStudySession({
    id: "breaks-not-pauses",
    taskDescription: "Separate records",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    breakEvents: [{ id: "planned", status: BREAK_STATUS.SCHEDULED, plannedStartElapsedMs: 5000 }],
    interruptions,
  });

  assert.equal(session.breakEvents.length, 1);
  assert.equal(session.interruptions.length, 2);
  assert.equal(session.breakEvents[0].status, BREAK_STATUS.SCHEDULED);
  assert.equal(session.interruptions[0].reason, INTERRUPTION_REASON.MANUAL_PAUSE);
});

test("dashboard source prioritizes current sessions before latest completed history", () => {
  const active = createStudySession({
    id: "active",
    taskDescription: "Active",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    status: SESSION_STATUS.ACTIVE,
  }, { now: () => baseTime });
  const paused = createStudySession({
    id: "paused",
    taskDescription: "Paused",
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    status: SESSION_STATUS.PAUSED,
  }, { now: () => baseTime });
  const completed = createCompletedStudySession(createStudySession({
    id: "completed",
    taskDescription: "Completed",
    startedAt: "2026-01-02T00:00:00.000Z",
    createdAt: baseTime,
    updatedAt: "2026-01-02T00:30:00.000Z",
  }, { now: () => baseTime }), {
    endedAt: "2026-01-02T00:30:00.000Z",
    statistics: calculateSessionStatistics([], { id: "completed" }),
    summary: generateSessionSummary({ statistics: calculateSessionStatistics([], { id: "completed" }), now: () => baseTime }),
    sampleCount: 0,
    dataCoverage: 0,
  });

  const activeSource = selectDashboardSessionSource({ activeSession: active, completedSessions: [completed] });
  assert.equal(activeSource.kind, "active");
  assert.equal(activeSource.session.id, "active");

  const pausedSource = selectDashboardSessionSource({ activeSession: paused, completedSessions: [completed] });
  assert.equal(pausedSource.kind, "paused");
  assert.equal(pausedSource.session.id, "paused");

  const completedSource = selectDashboardSessionSource({ activeSession: null, completedSessions: [completed] });
  assert.equal(completedSource.kind, "latest-completed");
  assert.equal(completedSource.session.id, "completed");

  const emptySource = selectDashboardSessionSource({ activeSession: null, completedSessions: [] });
  assert.equal(emptySource.kind, "empty");
  assert.equal(emptySource.session, null);
});

test("expression interval distribution counts only valid classified affect intervals", () => {
  const distribution = selectExpressionIntervalDistribution([
    { id: "valid-1", intervalStartedAt: "2026-01-01T00:00:00.000Z", valence: 0.2, arousal: 0.3, emotion: "Happiness", emotionConfidence: 0.2 },
    { id: "valid-2", intervalStartedAt: "2026-01-01T00:00:05.000Z", valence: -0.2, arousal: 0.1, emotion: "Sadness", emotionConfidence: 0.9 },
    { id: "valid-3", intervalStartedAt: "2026-01-01T00:00:10.000Z", valence: 0.1, arousal: 0.2, emotion: "Happiness", emotionConfidence: 0.1 },
    { id: "missing-affect", intervalStartedAt: "2026-01-01T00:00:15.000Z", valence: null, arousal: 0.1, emotion: "Neutral", emotionConfidence: 0.8 },
    { id: "missing-emotion", intervalStartedAt: "2026-01-01T00:00:20.000Z", valence: 0.1, arousal: 0.1, emotion: null, emotionConfidence: 0.8 },
    { id: "unknown-emotion", intervalStartedAt: "2026-01-01T00:00:25.000Z", valence: 0.1, arousal: 0.1, emotion: "NotAClass", emotionConfidence: 0.8 },
  ]);

  const happiness = distribution.items.find((item) => item.label === "Happiness");
  const sadness = distribution.items.find((item) => item.label === "Sadness");

  assert.equal(distribution.total, 3);
  assert.equal(happiness.count, 2);
  assert.equal(happiness.percentage, 2 / 3);
  assert.equal(sadness.count, 1);
  assert.equal(sadness.percentage, 1 / 3);
  assert.deepEqual(distribution.items.map((item) => item.label), EMOTION_LABELS);
});

test("expression interval distribution reports honest empty state data", () => {
  const distribution = selectExpressionIntervalDistribution([
    { id: "invalid-1", valence: null, arousal: null, emotion: "Neutral" },
    { id: "invalid-2", valence: 0.1, arousal: 0.2, emotion: null },
  ]);

  assert.equal(distribution.total, 0);
  assert.equal(distribution.items.length, EMOTION_LABELS.length);
  assert.ok(distribution.items.every((item) => item.count === 0 && item.percentage === 0));
});
