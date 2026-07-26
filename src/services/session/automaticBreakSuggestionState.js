export const BREAK_MODE_AUTOMATIC = "automatic";
export const BREAK_MODE_REGULAR = "regular";

export const TIMING_MODE_DEBUG = "debug";
export const TIMING_MODE_REGULAR = "regular";

export const AUTOMATIC_SUGGESTION_LEVEL = Object.freeze({
  WEAK_1: "weak-1",
  WEAK_2: "weak-2",
  STRONG_1: "strong-1",
  STRONG_2: "strong-2",
});

export const AUTOMATIC_SUGGESTION_PHASE = Object.freeze({
  SUGGESTION: "suggestion",
  CONTINUE_CONFIRMATION: "continue-confirmation",
  DURATION_CHOOSER: "duration-chooser",
});

export const AUTOMATIC_DURATION_CHOOSER_ORIGIN = Object.freeze({
  SUGGESTION: "suggestion",
  MANUAL_ENTRY: "manual-entry",
});

export const AUTOMATIC_SUGGESTION_OUTCOME = Object.freeze({
  DEFERRED: "deferred",
  EXPIRED: "expired",
  CONTINUED: "continued",
  BREAK_STARTED: "break-started",
});

export const AUTOMATIC_BREAK_EVENT_SOURCE = "automatic-suggestion";
export const REGULAR_BREAK_EVENT_SOURCE = "regular-plan";

const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;

const PRODUCTION_THRESHOLDS_MS = Object.freeze([45, 60, 90, 135].map((minutes) => minutes * MINUTE_MS));
const DEBUG_THRESHOLDS_MS = Object.freeze([15, 30, 45, 60].map((seconds) => seconds * SECOND_MS));
const PRODUCTION_DURATION_CHOICES_MS = Object.freeze([5, 10, 15].map((minutes) => minutes * MINUTE_MS));
const DEBUG_DURATION_CHOICES_MS = Object.freeze([5, 10, 15].map((seconds) => seconds * SECOND_MS));
const LEVEL_BY_INDEX = Object.freeze([
  AUTOMATIC_SUGGESTION_LEVEL.WEAK_1,
  AUTOMATIC_SUGGESTION_LEVEL.WEAK_2,
  AUTOMATIC_SUGGESTION_LEVEL.STRONG_1,
  AUTOMATIC_SUGGESTION_LEVEL.STRONG_2,
]);

const OUTCOMES = new Set(Object.values(AUTOMATIC_SUGGESTION_OUTCOME));
const PHASES = new Set(Object.values(AUTOMATIC_SUGGESTION_PHASE));
const LEVELS = new Set(Object.values(AUTOMATIC_SUGGESTION_LEVEL));
const DURATION_CHOOSER_ORIGINS = new Set(Object.values(AUTOMATIC_DURATION_CHOOSER_ORIGIN));

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const ms = (value, fallback = 0) => (isFiniteNumber(value) && value >= 0 ? Math.round(value) : fallback);
const nullableMs = (value) => (isFiniteNumber(value) && value >= 0 ? Math.round(value) : null);
const iso = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : fallback;
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};

export const normalizeTimingMode = (value) => (
  value === TIMING_MODE_DEBUG ? TIMING_MODE_DEBUG : TIMING_MODE_REGULAR
);

export const isDebugTimingMode = (sessionOrPlan = {}) => {
  const plan = sessionOrPlan?.sessionPlan || sessionOrPlan || {};
  return plan.timingMode === TIMING_MODE_DEBUG;
};

export const getAutomaticBreakTimingProfile = (timingMode = TIMING_MODE_REGULAR) => {
  const normalizedMode = normalizeTimingMode(timingMode);
  if (normalizedMode === TIMING_MODE_DEBUG) {
    return {
      timingMode: TIMING_MODE_DEBUG,
      thresholdsMs: DEBUG_THRESHOLDS_MS,
      minimumRemainingStudyMs: 15 * SECOND_MS,
      promptTimeoutMs: 3 * SECOND_MS,
      durationChoicesMs: DEBUG_DURATION_CHOICES_MS,
      unitLabel: "seconds",
    };
  }
  return {
    timingMode: TIMING_MODE_REGULAR,
    thresholdsMs: PRODUCTION_THRESHOLDS_MS,
    minimumRemainingStudyMs: 15 * MINUTE_MS,
    promptTimeoutMs: 3 * MINUTE_MS,
    durationChoicesMs: PRODUCTION_DURATION_CHOICES_MS,
    unitLabel: "minutes",
  };
};

export const getAutomaticSuggestionLevel = (thresholdMs, timingMode = TIMING_MODE_REGULAR) => {
  const profile = getAutomaticBreakTimingProfile(timingMode);
  const index = profile.thresholdsMs.indexOf(ms(thresholdMs, -1));
  return index >= 0 ? LEVEL_BY_INDEX[index] : null;
};

export const isWeakSuggestionLevel = (level) => (
  level === AUTOMATIC_SUGGESTION_LEVEL.WEAK_1 ||
  level === AUTOMATIC_SUGGESTION_LEVEL.WEAK_2
);

export const createIdleAutomaticBreakSuggestionState = () => ({
  cycleStartElapsedMs: 0,
  handledThresholds: [],
  activePrompt: null,
});

const normalizeHandledThreshold = (input = {}, timingMode = TIMING_MODE_REGULAR) => {
  const source = isObject(input) ? input : {};
  const thresholdMs = ms(source.thresholdMs, null);
  const level = LEVELS.has(source.level) ? source.level : getAutomaticSuggestionLevel(thresholdMs, timingMode);
  if (!isFiniteNumber(thresholdMs) || !level) return null;
  return {
    thresholdMs,
    level,
    outcome: OUTCOMES.has(source.outcome) ? source.outcome : AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED,
    handledAtElapsedMs: ms(source.handledAtElapsedMs, 0),
    handledAt: iso(source.handledAt, null),
  };
};

const normalizeActivePrompt = (input = {}, timingMode = TIMING_MODE_REGULAR) => {
  if (!isObject(input)) return null;
  const source = isObject(input) ? input : {};
  const thresholdMs = nullableMs(source.thresholdMs);
  const level = LEVELS.has(source.level) ? source.level : getAutomaticSuggestionLevel(thresholdMs, timingMode);
  const phase = PHASES.has(source.phase) ? source.phase : AUTOMATIC_SUGGESTION_PHASE.SUGGESTION;
  const durationChooserOrigin = phase === AUTOMATIC_SUGGESTION_PHASE.DURATION_CHOOSER
      ? (
          DURATION_CHOOSER_ORIGINS.has(source.durationChooserOrigin)
            ? source.durationChooserOrigin
            : source.alarmAttemptedAt
              ? AUTOMATIC_DURATION_CHOOSER_ORIGIN.SUGGESTION
              : AUTOMATIC_DURATION_CHOOSER_ORIGIN.MANUAL_ENTRY
        )
      : null;
  if (!level || thresholdMs === null) return null;
  return {
    thresholdMs,
    level,
    openedAt: iso(source.openedAt, null),
    expiresAt: phase === AUTOMATIC_SUGGESTION_PHASE.SUGGESTION ? iso(source.expiresAt, null) : null,
    alarmAttemptedAt: iso(source.alarmAttemptedAt, null),
    phase,
    durationChooserOrigin,
  };
};

export const normalizeAutomaticBreakSuggestionState = (input = {}, options = {}) => {
  const source = isObject(input) ? input : {};
  const timingMode = normalizeTimingMode(options.timingMode);
  const handled = Array.isArray(source.handledThresholds)
    ? source.handledThresholds
      .map((entry) => normalizeHandledThreshold(entry, timingMode))
      .filter(Boolean)
    : [];
  const sortedHandled = handled.sort((a, b) => {
    const diff = a.thresholdMs - b.thresholdMs;
    if (diff !== 0) return diff;
    return a.handledAtElapsedMs - b.handledAtElapsedMs;
  });

  return {
    cycleStartElapsedMs: ms(source.cycleStartElapsedMs, 0),
    handledThresholds: sortedHandled,
    activePrompt: normalizeActivePrompt(source.activePrompt, timingMode),
  };
};

export const inferBreakMode = ({ breakMode, sessionPlan, breakEvents } = {}) => {
  if (breakMode === BREAK_MODE_AUTOMATIC || breakMode === BREAK_MODE_REGULAR) return breakMode;
  const planHasRegularBreaks = isFiniteNumber(sessionPlan?.focusDurationMs) &&
    sessionPlan.focusDurationMs > 0 &&
    isFiniteNumber(sessionPlan?.breakDurationMs) &&
    sessionPlan.breakDurationMs > 0 &&
    Number.isInteger(sessionPlan?.plannedBreakCount) &&
    sessionPlan.plannedBreakCount > 0;
  const hasRegularEvents = Array.isArray(breakEvents) && breakEvents.some((event) => (
    event?.source === REGULAR_BREAK_EVENT_SOURCE ||
    (event?.source !== AUTOMATIC_BREAK_EVENT_SOURCE && event?.plannedStartElapsedMs !== null && event?.plannedStartElapsedMs !== undefined)
  ));
  return planHasRegularBreaks || hasRegularEvents ? BREAK_MODE_REGULAR : BREAK_MODE_AUTOMATIC;
};

export const getEligibleAutomaticThresholds = ({
  targetDurationMs = null,
  cycleStartElapsedMs = 0,
  timingMode = TIMING_MODE_REGULAR,
} = {}) => {
  if (!isFiniteNumber(targetDurationMs) || targetDurationMs <= 0) return [];
  const profile = getAutomaticBreakTimingProfile(timingMode);
  const cycleStart = ms(cycleStartElapsedMs, 0);
  return profile.thresholdsMs.filter((thresholdMs) => (
    cycleStart + thresholdMs + profile.minimumRemainingStudyMs <= targetDurationMs
  ));
};

const hasHandledThreshold = (state, thresholdMs) => (
  state.handledThresholds.some((entry) => entry.thresholdMs === thresholdMs)
);

export const selectNextAutomaticSuggestion = ({
  state = createIdleAutomaticBreakSuggestionState(),
  elapsedMs = 0,
  targetDurationMs = null,
  timingMode = TIMING_MODE_REGULAR,
} = {}) => {
  const normalizedState = normalizeAutomaticBreakSuggestionState(state, { timingMode });
  if (normalizedState.activePrompt) return null;
  const cycleElapsedMs = ms(elapsedMs, 0) - normalizedState.cycleStartElapsedMs;
  if (cycleElapsedMs < 0) return null;
  const eligible = getEligibleAutomaticThresholds({
    targetDurationMs,
    cycleStartElapsedMs: normalizedState.cycleStartElapsedMs,
    timingMode,
  });
  const thresholdMs = eligible.find((value) => cycleElapsedMs >= value && !hasHandledThreshold(normalizedState, value));
  if (!thresholdMs) return null;
  const level = getAutomaticSuggestionLevel(thresholdMs, timingMode);
  return level ? { thresholdMs, level } : null;
};

export const openAutomaticBreakPrompt = (state, { thresholdMs, level, now, timingMode = TIMING_MODE_REGULAR } = {}) => {
  const normalizedState = normalizeAutomaticBreakSuggestionState(state, { timingMode });
  const timestamp = iso(now, new Date().toISOString());
  const profile = getAutomaticBreakTimingProfile(timingMode);
  const resolvedLevel = LEVELS.has(level) ? level : getAutomaticSuggestionLevel(thresholdMs, timingMode);
  return {
    ...normalizedState,
    activePrompt: {
      thresholdMs: ms(thresholdMs, 0),
      level: resolvedLevel,
      openedAt: timestamp,
      expiresAt: new Date(Date.parse(timestamp) + profile.promptTimeoutMs).toISOString(),
      alarmAttemptedAt: timestamp,
      phase: AUTOMATIC_SUGGESTION_PHASE.SUGGESTION,
    },
  };
};

export const setAutomaticPromptPhase = (state, phase, options = {}) => {
  const normalizedState = normalizeAutomaticBreakSuggestionState(state, options);
  if (!normalizedState.activePrompt || !PHASES.has(phase)) return normalizedState;
  return {
    ...normalizedState,
    activePrompt: {
      ...normalizedState.activePrompt,
      phase,
      expiresAt: phase === AUTOMATIC_SUGGESTION_PHASE.SUGGESTION
        ? normalizedState.activePrompt.expiresAt
        : null,
    },
  };
};

export const markAutomaticThresholdHandled = (state, {
  thresholdMs,
  level,
  outcome,
  handledAtElapsedMs = 0,
  handledAt = null,
  timingMode = TIMING_MODE_REGULAR,
} = {}) => {
  const normalizedState = normalizeAutomaticBreakSuggestionState(state, { timingMode });
  const resolvedThresholdMs = ms(thresholdMs ?? normalizedState.activePrompt?.thresholdMs, 0);
  const resolvedLevel = LEVELS.has(level)
    ? level
    : normalizedState.activePrompt?.level || getAutomaticSuggestionLevel(resolvedThresholdMs, timingMode);
  if (!resolvedLevel || !OUTCOMES.has(outcome)) return normalizedState;
  const nextEntry = {
    thresholdMs: resolvedThresholdMs,
    level: resolvedLevel,
    outcome,
    handledAtElapsedMs: ms(handledAtElapsedMs, 0),
    handledAt: iso(handledAt, null),
  };
  const nextHandled = normalizedState.handledThresholds
    .filter((entry) => entry.thresholdMs !== resolvedThresholdMs)
    .concat(nextEntry)
    .sort((a, b) => a.thresholdMs - b.thresholdMs);
  return {
    ...normalizedState,
    handledThresholds: nextHandled,
    activePrompt: null,
  };
};

export const resolveExpiredAutomaticPrompt = (state, { now, elapsedMs = 0, timingMode = TIMING_MODE_REGULAR } = {}) => {
  const normalizedState = normalizeAutomaticBreakSuggestionState(state, { timingMode });
  const prompt = normalizedState.activePrompt;
  if (!prompt || prompt.phase !== AUTOMATIC_SUGGESTION_PHASE.SUGGESTION || !prompt.expiresAt) return normalizedState;
  const nowTime = Date.parse(now || new Date().toISOString());
  const expiryTime = Date.parse(prompt.expiresAt);
  if (!Number.isFinite(nowTime) || !Number.isFinite(expiryTime) || nowTime < expiryTime) return normalizedState;
  return markAutomaticThresholdHandled(normalizedState, {
    thresholdMs: prompt.thresholdMs,
    level: prompt.level,
    outcome: AUTOMATIC_SUGGESTION_OUTCOME.EXPIRED,
    handledAtElapsedMs: elapsedMs,
    handledAt: new Date(nowTime).toISOString(),
    timingMode,
  });
};

export const resetAutomaticBreakCycle = (state, { cycleStartElapsedMs = 0, timingMode = TIMING_MODE_REGULAR } = {}) => ({
  ...normalizeAutomaticBreakSuggestionState(state, { timingMode }),
  cycleStartElapsedMs: ms(cycleStartElapsedMs, 0),
  handledThresholds: [],
  activePrompt: null,
});

export const shouldShowManualAutomaticBreakEntry = (state, options = {}) => {
  const normalizedState = normalizeAutomaticBreakSuggestionState(state, options);
  return normalizedState.handledThresholds.some((entry) => (
    entry.outcome === AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED ||
    entry.outcome === AUTOMATIC_SUGGESTION_OUTCOME.EXPIRED ||
    entry.outcome === AUTOMATIC_SUGGESTION_OUTCOME.CONTINUED
  ));
};

export const getPromptRemainingMs = (state, { now = new Date().toISOString(), timingMode = TIMING_MODE_REGULAR } = {}) => {
  const prompt = normalizeAutomaticBreakSuggestionState(state, { timingMode }).activePrompt;
  if (!prompt || prompt.phase !== AUTOMATIC_SUGGESTION_PHASE.SUGGESTION || !prompt.expiresAt) return 0;
  const remaining = Date.parse(prompt.expiresAt) - Date.parse(now);
  return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
};
