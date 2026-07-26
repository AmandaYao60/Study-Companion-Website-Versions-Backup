import test from "node:test";
import assert from "node:assert/strict";

import {
  BREAK_STATUS,
  BREAK_PHASE,
  createIdleBreakState,
  findBreakEvent,
  formatCountdown,
  getNextScheduledBreakEvent,
  isBreakBlockingPhase,
  isBreakModePhase,
} from "./index.js";

test("idle timed-break state has the expected serializable shape", () => {
  assert.deepEqual(createIdleBreakState(), {
    phase: BREAK_PHASE.IDLE,
    breakId: null,
    plannedStartElapsedMs: null,
    baseDurationMs: 0,
    extensionCount: 0,
    activeSegmentStartedAt: null,
    activeSegmentDurationMs: 0,
    decisionStartedAt: null,
    remainingMs: 0,
    decisionElapsedMs: 0,
    audioBlocked: false,
  });
});

test("timed-break phase selectors distinguish warning, blocking, and break mode", () => {
  assert.equal(isBreakBlockingPhase(BREAK_PHASE.WARNING), false);
  assert.equal(isBreakModePhase(BREAK_PHASE.WARNING), false);

  assert.equal(isBreakBlockingPhase(BREAK_PHASE.READY), true);
  assert.equal(isBreakModePhase(BREAK_PHASE.READY), false);

  assert.equal(isBreakBlockingPhase(BREAK_PHASE.ACTIVE), true);
  assert.equal(isBreakModePhase(BREAK_PHASE.ACTIVE), true);
  assert.equal(isBreakBlockingPhase(BREAK_PHASE.END_EARLY_CONFIRMATION), true);
  assert.equal(isBreakModePhase(BREAK_PHASE.END_EARLY_CONFIRMATION), true);
  assert.equal(isBreakBlockingPhase(BREAK_PHASE.COMPLETE_DECISION), true);
  assert.equal(isBreakModePhase(BREAK_PHASE.COMPLETE_DECISION), true);
});

test("formatCountdown rounds up safely at boundaries", () => {
  assert.equal(formatCountdown(-1), "0:00");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(1), "0:01");
  assert.equal(formatCountdown(999), "0:01");
  assert.equal(formatCountdown(1000), "0:01");
  assert.equal(formatCountdown(59_001), "1:00");
  assert.equal(formatCountdown(60_000), "1:00");
  assert.equal(formatCountdown(61_000), "1:01");
});

test("findBreakEvent normalizes persisted events before lookup", () => {
  const event = findBreakEvent({
    breakEvents: [
      { id: "break-1", status: "bad-status", plannedStartElapsedMs: 1000 },
    ],
  }, "break-1");

  assert.equal(event.id, "break-1");
  assert.equal(event.status, BREAK_STATUS.SCHEDULED);
});

test("getNextScheduledBreakEvent selects the earliest scheduled break", () => {
  const session = {
    breakEvents: [
      { id: "completed", status: BREAK_STATUS.COMPLETED, plannedStartElapsedMs: 1000 },
      { id: "later", status: BREAK_STATUS.SCHEDULED, plannedStartElapsedMs: 3000 },
      { id: "earlier", status: BREAK_STATUS.SCHEDULED, plannedStartElapsedMs: 2000 },
    ],
  };

  assert.equal(getNextScheduledBreakEvent(session).id, "earlier");
  assert.equal(getNextScheduledBreakEvent(session).id, "earlier");
});

test("normalized break-event ordering does not select skipped or active events", () => {
  const session = {
    breakEvents: [
      { id: "skipped", status: BREAK_STATUS.SKIPPED, plannedStartElapsedMs: 1000 },
      { id: "active", status: BREAK_STATUS.ACTIVE, plannedStartElapsedMs: 1500 },
      { id: "scheduled", status: BREAK_STATUS.SCHEDULED, plannedStartElapsedMs: 2000 },
      { id: "invalid-defaults-to-scheduled", status: "unknown", plannedStartElapsedMs: 2500 },
    ],
  };

  assert.equal(getNextScheduledBreakEvent(session).id, "scheduled");
});

test("getNextScheduledBreakEvent returns null when no scheduled break exists", () => {
  assert.equal(getNextScheduledBreakEvent({ breakEvents: [] }), null);
  assert.equal(getNextScheduledBreakEvent({
    breakEvents: [
      { id: "done", status: BREAK_STATUS.COMPLETED, plannedStartElapsedMs: 1000 },
    ],
  }), null);
});
