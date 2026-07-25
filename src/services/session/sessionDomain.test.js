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
  aggregateMetricObservations,
  calculateMetricStatistics,
  calculateSessionStatistics,
  calculatePlannedBreakPositions,
  cancelBreak,
  completeBreak,
  classifyDataQuality,
  createCompletedStudySession,
  createIndexedDbSessionRepository,
  createMemorySessionRepository,
  createStudySession,
  generateSessionSummary,
  getNextScheduledBreak,
  normalizeBreakEvents,
  normalizeInterruptions,
  normalizePostSessionCheckOut,
  normalizeSessionPlan,
  normalizeStudySession,
  selectDashboardMetricCards,
  selectDashboardSessionSource,
  selectDominantEmotion,
  selectExpressionIntervalDistribution,
  skipBreak,
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

test("summary generation becomes cautious when coverage is insufficient", () => {
  const statistics = calculateSessionStatistics([], { id: "session-1" });
  const summary = generateSessionSummary({ statistics, now: () => baseTime });
  assert.equal(summary.overallStatus.confidence, "insufficient");
  assert.match(summary.overallStatus.message, /not enough valid data/i);
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
