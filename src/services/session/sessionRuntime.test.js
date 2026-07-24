import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_STATUS,
  createMemorySessionRepository,
  createSessionRuntime,
} from "./index.js";

let nowValue = "2026-01-01T00:00:00.000Z";
const now = () => nowValue;
const setNow = (isoTimestamp) => {
  nowValue = isoTimestamp;
};

const createObservation = (elapsedMs, overrides = {}) => ({
  recordedAt: new Date(Date.parse("2026-01-01T00:00:00.000Z") + elapsedMs).toISOString(),
  elapsedMs,
  attention: 72,
  fatigue: 18,
  valence: null,
  arousal: null,
  emotion: null,
  emotionConfidence: null,
  faceDetected: true,
  affectValid: false,
  dataValid: true,
  ...overrides,
});

test("session runtime prepares, activates, pauses, resumes, samples, and finishes one session", async () => {
  const runtime = createSessionRuntime({
    now,
    idFactory: () => "runtime-session-1",
    sampleIntervalMs: 1000,
  });

  const prepared = await runtime.prepareSession({
    taskDescription: "Read chapter 4",
    targetDurationMs: 25 * 60000,
  });

  assert.equal(prepared.id, "runtime-session-1");
  assert.equal(prepared.status, SESSION_STATUS.PREPARED);
  assert.equal(prepared.taskDescription, "Read chapter 4");

  const ignoredWhilePrepared = await runtime.appendObservation(createObservation(0));
  assert.deepEqual(ignoredWhilePrepared, []);

  const started = await runtime.activatePreparedSession();
  assert.equal(started.id, prepared.id);
  assert.equal(started.status, SESSION_STATUS.ACTIVE);

  await runtime.appendObservation(createObservation(0));
  await runtime.appendObservation(createObservation(500));

  const paused = await runtime.pauseSession(500);
  assert.equal(paused.status, SESSION_STATUS.PAUSED);
  assert.equal(paused.accumulatedStudyMs, 500);

  const ignoredWhilePaused = await runtime.appendObservation(createObservation(1500, { attention: 5, fatigue: 95 }));
  assert.deepEqual(ignoredWhilePaused, []);

  const resumed = await runtime.resumeSession();
  assert.equal(resumed.id, started.id);
  assert.equal(resumed.status, SESSION_STATUS.ACTIVE);

  const appended = await runtime.appendObservation(createObservation(1200));
  assert.equal(appended.length, 1);
  assert.equal(appended[0].attention, 72);
  assert.equal(appended[0].fatigue, 18);
  assert.equal(appended[0].valence, null);
  assert.equal(appended[0].arousal, null);

  setNow("2026-01-01T00:20:00.000Z");
  const completed = await runtime.finishSession(1200);
  assert.equal(completed.status, SESSION_STATUS.COMPLETED);
  assert.equal(completed.actualDurationMs, 1200);
  assert.equal(completed.sampleCount, 1);
  assert.ok(completed.statistics);
  assert.ok(completed.summary);

  const history = await runtime.listCompletedSessions();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, started.id);

  const sessionById = await runtime.getSessionById(started.id);
  assert.equal(sessionById.id, started.id);

  const samples = await runtime.getMetricSamples(started.id);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].sessionId, started.id);

  assert.equal(runtime.getSnapshot().activeSession, null);
});

test("discard removes the active session without creating completed history", async () => {
  setNow("2026-01-02T00:00:00.000Z");
  const runtime = createSessionRuntime({
    now,
    idFactory: () => "runtime-session-discard",
    sampleIntervalMs: 1000,
  });

  await runtime.prepareSession({ taskDescription: "Temporary task" });
  await runtime.activatePreparedSession();
  await runtime.appendObservation(createObservation(0));
  await runtime.pauseSession(200);

  const snapshotBeforeDiscard = runtime.getSnapshot();
  assert.equal(snapshotBeforeDiscard.activeSession.status, SESSION_STATUS.PAUSED);
  assert.equal(snapshotBeforeDiscard.activeSession.accumulatedStudyMs, 200);

  const discarded = await runtime.discardSession();
  assert.equal(discarded, true);
  assert.equal(runtime.getSnapshot().activeSession, null);
  assert.deepEqual(await runtime.listCompletedSessions(), []);
  assert.deepEqual(await runtime.getMetricSamples("runtime-session-discard"), []);
});

test("runtime recovers interrupted active sessions as paused without adding refresh time", async () => {
  const repository = createMemorySessionRepository();
  setNow("2026-01-03T00:00:00.000Z");
  const firstRuntime = createSessionRuntime({
    repository,
    now,
    idFactory: () => "runtime-session-recover",
    sampleIntervalMs: 1000,
  });

  const prepared = await firstRuntime.prepareSession({ taskDescription: "Recoverable task" });
  await firstRuntime.activatePreparedSession();
  await firstRuntime.checkpointActiveSession(15000, {
    checkpointedAt: "2026-01-03T00:00:15.000Z",
  });

  setNow("2026-01-03T01:00:00.000Z");
  const recoveredRuntime = createSessionRuntime({ repository, now, sampleIntervalMs: 1000 });
  const initialization = await recoveredRuntime.initializeSessionState();
  const recovered = initialization.recoveredSession;

  assert.equal(recovered.id, prepared.id);
  assert.equal(recovered.status, SESSION_STATUS.PAUSED);
  assert.equal(recovered.recoveryPending, true);
  assert.equal(recovered.accumulatedStudyMs, 15000);
  assert.equal(recovered.lastCheckpointAt, "2026-01-03T00:00:15.000Z");

  setNow("2026-01-03T02:00:00.000Z");
  const repeatedRefreshRuntime = createSessionRuntime({ repository, now, sampleIntervalMs: 1000 });
  const repeatedInitialization = await repeatedRefreshRuntime.initializeSessionState();

  assert.equal(repeatedInitialization.recoveredSession.id, prepared.id);
  assert.equal(repeatedInitialization.recoveredSession.status, SESSION_STATUS.PAUSED);
  assert.equal(repeatedInitialization.recoveredSession.recoveryPending, true);
  assert.equal(repeatedInitialization.recoveredSession.accumulatedStudyMs, 15000);

  const resumed = await repeatedRefreshRuntime.resumeSession();
  assert.equal(resumed.id, prepared.id);
  assert.equal(resumed.status, SESSION_STATUS.ACTIVE);
  assert.equal(resumed.recoveryPending, false);
  assert.equal(resumed.accumulatedStudyMs, 15000);
});

test("finish from recovered session preserves samples and excludes time away", async () => {
  const repository = createMemorySessionRepository();
  setNow("2026-01-04T00:00:00.000Z");
  const firstRuntime = createSessionRuntime({
    repository,
    now,
    idFactory: () => "runtime-session-recovered-finish",
    sampleIntervalMs: 1000,
  });

  const prepared = await firstRuntime.prepareSession({ taskDescription: "Finish recovered" });
  await firstRuntime.activatePreparedSession();
  await firstRuntime.appendObservation(createObservation(0));
  await firstRuntime.appendObservation(createObservation(1000));
  await firstRuntime.checkpointActiveSession(2000, {
    checkpointedAt: "2026-01-04T00:00:02.000Z",
  });

  setNow("2026-01-04T04:00:00.000Z");
  const recoveredRuntime = createSessionRuntime({ repository, now, sampleIntervalMs: 1000 });
  await recoveredRuntime.initializeSessionState();

  const samplesBeforeFinish = await recoveredRuntime.getMetricSamples(prepared.id);
  assert.equal(samplesBeforeFinish.length, 1);

  const completed = await recoveredRuntime.finishSession(2000);
  assert.equal(completed.id, prepared.id);
  assert.equal(completed.status, SESSION_STATUS.COMPLETED);
  assert.equal(completed.actualDurationMs, 2000);
  assert.equal(completed.sampleCount, 1);

  const laterRuntime = createSessionRuntime({ repository, now, sampleIntervalMs: 1000 });
  const laterInitialization = await laterRuntime.initializeSessionState();
  assert.equal(laterInitialization.recoveredSession, null);
  assert.equal((await laterRuntime.listCompletedSessions()).length, 1);
});

test("recovered sessions continue sample numbering and discard cascades samples", async () => {
  const repository = createMemorySessionRepository();
  setNow("2026-01-05T00:00:00.000Z");
  const firstRuntime = createSessionRuntime({
    repository,
    now,
    idFactory: () => "runtime-session-recovered-discard",
    sampleIntervalMs: 1000,
  });

  const prepared = await firstRuntime.prepareSession({ taskDescription: "Discard recovered" });
  await firstRuntime.activatePreparedSession();
  await firstRuntime.appendObservation(createObservation(0));
  await firstRuntime.appendObservation(createObservation(1000));
  await firstRuntime.checkpointActiveSession(1500, {
    checkpointedAt: "2026-01-05T00:00:01.500Z",
  });

  const recoveredRuntime = createSessionRuntime({ repository, now, sampleIntervalMs: 1000 });
  await recoveredRuntime.initializeSessionState();
  await recoveredRuntime.resumeSession();
  await recoveredRuntime.appendObservation(createObservation(2000));
  await recoveredRuntime.appendObservation(createObservation(3000));

  const samples = await recoveredRuntime.getMetricSamples(prepared.id);
  assert.deepEqual(samples.map((sample) => sample.id), [
    "runtime-session-recovered-discard-sample-1",
    "runtime-session-recovered-discard-sample-2",
  ]);

  await recoveredRuntime.pauseSession(3000);
  const discarded = await recoveredRuntime.discardSession();
  assert.equal(discarded, true);
  assert.equal(await recoveredRuntime.getSessionById(prepared.id), null);
  assert.deepEqual(await recoveredRuntime.getMetricSamples(prepared.id), []);
});

test("runtime persists setup context and post-session reflection on completion", async () => {
  setNow("2026-01-06T00:00:00.000Z");
  const runtime = createSessionRuntime({
    now,
    idFactory: () => "runtime-session-reflection",
    sampleIntervalMs: 1000,
  });

  const prepared = await runtime.prepareSession({
    taskName: "SAT Reading Practice",
    taskDescription: "SAT Reading Practice",
    targetDurationMs: 25 * 60000,
    subject: "test_preparation",
    taskType: "reading",
    sessionGoal: "Finish one passage.",
    preSessionCheckIn: {
      expectedDifficulty: 3,
      taskConfidence: 4,
      mood: 2,
      energy: 4,
      taskValue: 5,
      recordedAt: "2026-01-06T00:00:00.000Z",
    },
  });

  assert.equal(prepared.status, SESSION_STATUS.PREPARED);
  assert.equal(prepared.subject, "test_preparation");
  assert.equal(prepared.preSessionCheckIn.energy, 4);

  await runtime.activatePreparedSession();
  const completed = await runtime.finishSession(1500, {
    postSessionCheckOut: {
      sessionEnergy: 3,
      sessionMood: 4,
      perceivedAttention: 5,
      strategiesUsed: ["elaboration", "organization"],
      primaryStrategy: "elaboration",
      primaryStrategyEffectiveness: 4,
      primaryLearningActivity: "generated_new_understanding",
      learningReflection: "  I improved main-idea timing. ",
      recordedAt: "2026-01-06T00:02:00.000Z",
    },
  });

  assert.equal(completed.id, prepared.id);
  assert.equal(completed.status, SESSION_STATUS.COMPLETED);
  assert.equal(completed.postSessionCheckOut.sessionEnergy, 3);
  assert.equal(completed.postSessionCheckOut.primaryStrategy, "elaboration");
  assert.equal(completed.postSessionCheckOut.learningReflection, "I improved main-idea timing.");
});
