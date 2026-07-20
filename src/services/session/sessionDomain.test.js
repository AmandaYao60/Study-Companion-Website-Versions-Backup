import test from "node:test";
import assert from "node:assert/strict";

import {
  CIRCUMPLEX_REFERENCE_LABELS,
  DATA_QUALITY,
  EMOTION_LABELS,
  SESSION_STATUS,
  aggregateMetricObservations,
  calculateMetricStatistics,
  calculateSessionStatistics,
  classifyDataQuality,
  createCompletedStudySession,
  createMemorySessionRepository,
  createStudySession,
  generateSessionSummary,
  hasCompleteCircumplexReferenceSet,
  selectDominantEmotion,
  sortSessionsByNewest,
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

test("circumplex configuration contains all eight expected labels", () => {
  assert.equal(CIRCUMPLEX_REFERENCE_LABELS.length, 8);
  assert.deepEqual([...CIRCUMPLEX_REFERENCE_LABELS].sort(), [...EMOTION_LABELS].sort());
  assert.equal(hasCompleteCircumplexReferenceSet(), true);
});
