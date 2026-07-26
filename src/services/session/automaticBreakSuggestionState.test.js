import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTOMATIC_BREAK_EVENT_SOURCE,
  AUTOMATIC_SUGGESTION_OUTCOME,
  AUTOMATIC_SUGGESTION_PHASE,
  BREAK_MODE_AUTOMATIC,
  BREAK_MODE_REGULAR,
  REGULAR_BREAK_EVENT_SOURCE,
  TIMING_MODE_DEBUG,
  createIdleAutomaticBreakSuggestionState,
  getAutomaticBreakTimingProfile,
  getEligibleAutomaticThresholds,
  inferBreakMode,
  markAutomaticThresholdHandled,
  normalizeAutomaticBreakSuggestionState,
  normalizeBreakEvents,
  normalizeSessionPlan,
  normalizeStudySession,
  openAutomaticBreakPrompt,
  resetAutomaticBreakCycle,
  resolveExpiredAutomaticPrompt,
  selectNextAutomaticSuggestion,
  shouldShowManualAutomaticBreakEntry,
  startAdHocBreak,
  AUTOMATIC_DURATION_CHOOSER_ORIGIN,
} from "./index.js";

const minute = 60 * 1000;
const second = 1000;
const baseTime = "2026-01-01T00:00:00.000Z";

test("automatic break timing profiles expose production and debug thresholds", () => {
  assert.deepEqual(getAutomaticBreakTimingProfile().thresholdsMs, [45, 60, 90, 135].map((value) => value * minute));
  assert.deepEqual(getAutomaticBreakTimingProfile(TIMING_MODE_DEBUG).thresholdsMs, [15, 30, 45, 60].map((value) => value * second));
  assert.equal(getAutomaticBreakTimingProfile().minimumRemainingStudyMs, 15 * minute);
  assert.equal(getAutomaticBreakTimingProfile(TIMING_MODE_DEBUG).minimumRemainingStudyMs, 15 * second);
  assert.equal(getAutomaticBreakTimingProfile(TIMING_MODE_DEBUG).promptTimeoutMs, 3 * second);
});

test("automatic eligibility honors minimum remaining study time boundaries", () => {
  const eligibleMinutes = (targetMinutes) => getEligibleAutomaticThresholds({
    targetDurationMs: targetMinutes * minute,
  }).map((value) => value / minute);

  assert.deepEqual(eligibleMinutes(59), []);
  assert.deepEqual(eligibleMinutes(60), [45]);
  assert.deepEqual(eligibleMinutes(75), [45, 60]);
  assert.deepEqual(eligibleMinutes(105), [45, 60, 90]);
  assert.deepEqual(eligibleMinutes(150), [45, 60, 90, 135]);
  assert.deepEqual(eligibleMinutes(180), [45, 60, 90, 135]);
});

test("automatic suggestion selection triggers each threshold once per cycle", () => {
  let state = createIdleAutomaticBreakSuggestionState();
  const targetDurationMs = 180 * minute;
  const first = selectNextAutomaticSuggestion({ state, elapsedMs: 45 * minute, targetDurationMs });
  assert.equal(first.thresholdMs, 45 * minute);

  state = markAutomaticThresholdHandled(state, {
    ...first,
    outcome: AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED,
    handledAtElapsedMs: 45 * minute,
    handledAt: baseTime,
  });
  assert.equal(selectNextAutomaticSuggestion({ state, elapsedMs: 50 * minute, targetDurationMs }), null);

  const second = selectNextAutomaticSuggestion({ state, elapsedMs: 60 * minute, targetDurationMs });
  assert.equal(second.thresholdMs, 60 * minute);
});

test("remind me later and expiration expose manual entry without suppressing later thresholds", () => {
  let state = markAutomaticThresholdHandled(createIdleAutomaticBreakSuggestionState(), {
    thresholdMs: 45 * minute,
    outcome: AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED,
    handledAtElapsedMs: 45 * minute,
    handledAt: baseTime,
  });
  assert.equal(shouldShowManualAutomaticBreakEntry(state), true);
  assert.equal(selectNextAutomaticSuggestion({ state, elapsedMs: 60 * minute, targetDurationMs: 180 * minute }).thresholdMs, 60 * minute);

  state = openAutomaticBreakPrompt(state, {
    thresholdMs: 60 * minute,
    now: baseTime,
  });
  const expired = resolveExpiredAutomaticPrompt(state, {
    now: "2026-01-01T00:03:01.000Z",
    elapsedMs: 63 * minute,
  });
  assert.equal(expired.activePrompt, null);
  assert.equal(expired.handledThresholds.at(-1).outcome, AUTOMATIC_SUGGESTION_OUTCOME.EXPIRED);
  assert.equal(shouldShowManualAutomaticBreakEntry(expired), true);
});

test("continue study uses a persisted confirmation phase before handled state", () => {
  const opened = openAutomaticBreakPrompt(createIdleAutomaticBreakSuggestionState(), {
    thresholdMs: 90 * minute,
    now: baseTime,
  });
  const confirmation = {
    ...opened,
    activePrompt: {
      ...opened.activePrompt,
      phase: AUTOMATIC_SUGGESTION_PHASE.CONTINUE_CONFIRMATION,
      expiresAt: null,
    },
  };
  const normalized = normalizeAutomaticBreakSuggestionState(confirmation);
  assert.equal(normalized.activePrompt.phase, AUTOMATIC_SUGGESTION_PHASE.CONTINUE_CONFIRMATION);
  assert.equal(normalized.activePrompt.expiresAt, null);

  const continued = markAutomaticThresholdHandled(normalized, {
    outcome: AUTOMATIC_SUGGESTION_OUTCOME.CONTINUED,
    handledAtElapsedMs: 91 * minute,
    handledAt: baseTime,
  });
  assert.equal(continued.activePrompt, null);
  assert.equal(continued.handledThresholds[0].outcome, AUTOMATIC_SUGGESTION_OUTCOME.CONTINUED);
  assert.equal(shouldShowManualAutomaticBreakEntry(continued), true);
});

test("refresh normalization preserves prompts and does not replay handled alarms", () => {
  const opened = openAutomaticBreakPrompt(createIdleAutomaticBreakSuggestionState(), {
    thresholdMs: 45 * minute,
    now: baseTime,
  });
  const normalizedOpen = normalizeAutomaticBreakSuggestionState(JSON.parse(JSON.stringify(opened)));
  assert.equal(normalizedOpen.activePrompt.alarmAttemptedAt, baseTime);

  const handled = markAutomaticThresholdHandled(opened, {
    outcome: AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED,
    handledAtElapsedMs: 45 * minute,
    handledAt: baseTime,
  });
  const normalizedHandled = normalizeAutomaticBreakSuggestionState(JSON.parse(JSON.stringify(handled)));
  assert.equal(normalizedHandled.activePrompt, null);
  assert.equal(normalizedHandled.handledThresholds[0].thresholdMs, 45 * minute);
});

test("completed suggested break resets the automatic cycle", () => {
  const state = markAutomaticThresholdHandled(createIdleAutomaticBreakSuggestionState(), {
    thresholdMs: 45 * minute,
    outcome: AUTOMATIC_SUGGESTION_OUTCOME.BREAK_STARTED,
    handledAtElapsedMs: 46 * minute,
    handledAt: baseTime,
  });
  const reset = resetAutomaticBreakCycle(state, { cycleStartElapsedMs: 46 * minute });
  assert.equal(reset.cycleStartElapsedMs, 46 * minute);
  assert.deepEqual(reset.handledThresholds, []);
  assert.equal(shouldShowManualAutomaticBreakEntry(reset), false);
  assert.equal(selectNextAutomaticSuggestion({ state: reset, elapsedMs: 90 * minute, targetDurationMs: 180 * minute }), null);
});

test("pause, refresh, and dismissal do not reset the automatic cycle", () => {
  const state = markAutomaticThresholdHandled(createIdleAutomaticBreakSuggestionState(), {
    thresholdMs: 45 * minute,
    outcome: AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED,
    handledAtElapsedMs: 45 * minute,
    handledAt: baseTime,
  });
  const normalized = normalizeAutomaticBreakSuggestionState(state);
  assert.equal(normalized.cycleStartElapsedMs, 0);
  assert.equal(selectNextAutomaticSuggestion({ state: normalized, elapsedMs: 60 * minute, targetDurationMs: 180 * minute }).thresholdMs, 60 * minute);
});

test("automatic and regular break modes normalize backward-compatible session shapes", () => {
  const automatic = normalizeStudySession({
    id: "automatic-session",
    taskDescription: "Automatic",
    targetDurationMs: 60 * minute,
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  assert.equal(automatic.breakMode, BREAK_MODE_AUTOMATIC);
  assert.equal(automatic.breakEvents.length, 0);

  const legacyRegular = normalizeStudySession({
    id: "legacy-regular",
    taskDescription: "Legacy regular",
    targetDurationMs: 60 * minute,
    sessionPlan: {
      targetDurationMs: 60 * minute,
      focusDurationMs: 25 * minute,
      breakDurationMs: 5 * minute,
    },
    breakEvents: [{ id: "planned-break-1", plannedStartElapsedMs: 25 * minute }],
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  assert.equal(legacyRegular.breakMode, BREAK_MODE_REGULAR);
  assert.equal(inferBreakMode({ breakEvents: legacyRegular.breakEvents }), BREAK_MODE_REGULAR);
});

test("automatic mode creates no scheduled regular breaks while regular mode can", () => {
  const automaticPlan = normalizeSessionPlan({ targetDurationMs: 180 * second, timingMode: TIMING_MODE_DEBUG });
  assert.equal(automaticPlan.timingMode, TIMING_MODE_DEBUG);
  assert.equal(automaticPlan.plannedBreakCount, 0);

  const regularPlan = normalizeSessionPlan({
    targetDurationMs: 60 * minute,
    focusDurationMs: 25 * minute,
    breakDurationMs: 5 * minute,
  });
  assert.equal(regularPlan.plannedBreakCount, 2);
});

test("suggested break-event source normalizes and remains recoverable", () => {
  const session = normalizeStudySession({
    id: "suggested-break-session",
    taskDescription: "Suggested break",
    breakMode: BREAK_MODE_AUTOMATIC,
    targetDurationMs: 180 * second,
    sessionPlan: {
      targetDurationMs: 180 * second,
      timingMode: TIMING_MODE_DEBUG,
    },
    startedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  const withSuggestedBreak = startAdHocBreak(session, {
    actualStartElapsedMs: 15 * second,
    durationMs: 10 * second,
    actualStartAt: baseTime,
    source: AUTOMATIC_BREAK_EVENT_SOURCE,
    suggestionThresholdMs: 15 * second,
  });
  assert.equal(withSuggestedBreak.breakEvents[0].source, AUTOMATIC_BREAK_EVENT_SOURCE);
  assert.equal(withSuggestedBreak.breakEvents[0].suggestionThresholdMs, 15 * second);

  const normalized = normalizeBreakEvents(withSuggestedBreak.breakEvents);
  assert.equal(normalized[0].source, AUTOMATIC_BREAK_EVENT_SOURCE);
  assert.equal(normalized[0].status, "active");

  const regular = normalizeBreakEvents([{ id: "legacy-planned", plannedStartElapsedMs: 25 * minute }]);
  assert.equal(regular[0].source, REGULAR_BREAK_EVENT_SOURCE);
  assert.equal(regular[0].suggestionThresholdMs, null);
});

test("duration chooser origin survives normalization", () => {
  const suggestionChooser = normalizeAutomaticBreakSuggestionState({
    cycleStartElapsedMs: 0,
    handledThresholds: [],
    activePrompt: {
      thresholdMs: 60 * minute,
      level: "weak-2",
      openedAt: baseTime,
      expiresAt: null,
      alarmAttemptedAt: baseTime,
      phase: AUTOMATIC_SUGGESTION_PHASE.DURATION_CHOOSER,
      durationChooserOrigin:
        AUTOMATIC_DURATION_CHOOSER_ORIGIN.SUGGESTION,
    },
  });

  assert.equal(
    suggestionChooser.activePrompt.durationChooserOrigin,
    AUTOMATIC_DURATION_CHOOSER_ORIGIN.SUGGESTION
  );

  const manualChooser = normalizeAutomaticBreakSuggestionState({
    cycleStartElapsedMs: 0,
    handledThresholds: [],
    activePrompt: {
      thresholdMs: 45 * minute,
      level: "weak-1",
      openedAt: baseTime,
      expiresAt: null,
      alarmAttemptedAt: null,
      phase: AUTOMATIC_SUGGESTION_PHASE.DURATION_CHOOSER,
      durationChooserOrigin:
        AUTOMATIC_DURATION_CHOOSER_ORIGIN.MANUAL_ENTRY,
    },
  });

  assert.equal(
    manualChooser.activePrompt.durationChooserOrigin,
    AUTOMATIC_DURATION_CHOOSER_ORIGIN.MANUAL_ENTRY
  );
});
