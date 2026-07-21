import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_STATUS,
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
