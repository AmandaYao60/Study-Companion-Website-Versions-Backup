import {
  BREAK_DECISION_WAIT_MS,
  BREAK_STATUS,
} from "./sessionConstants.js";
import {
  normalizeBreakEvents,
} from "./sessionBreaks.js";

export const BREAK_PHASE = Object.freeze({
  IDLE: "idle",
  WARNING: "pre-break-warning",
  READY: "break-ready",
  SKIP_CONFIRMATION: "skip-confirmation",
  ACTIVE: "active-break",
  END_EARLY_CONFIRMATION: "end-early-confirmation",
  COMPLETE_DECISION: "break-complete-awaiting-decision",
  PAUSED_FALLBACK: "paused-session",
});

export const createIdleBreakState = () => ({
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

export const isBreakModePhase = (phase) => (
  phase === BREAK_PHASE.ACTIVE ||
  phase === BREAK_PHASE.END_EARLY_CONFIRMATION ||
  phase === BREAK_PHASE.COMPLETE_DECISION
);

export const isBreakBlockingPhase = (phase) => (
  phase === BREAK_PHASE.READY ||
  phase === BREAK_PHASE.SKIP_CONFIRMATION ||
  phase === BREAK_PHASE.ACTIVE ||
  phase === BREAK_PHASE.END_EARLY_CONFIRMATION ||
  phase === BREAK_PHASE.COMPLETE_DECISION
);

export const findBreakEvent = (session, breakId) => (
  normalizeBreakEvents(session?.breakEvents || []).find((event) => event.id === breakId) || null
);

export const getNextScheduledBreakEvent = (session) => (
  normalizeBreakEvents(session?.breakEvents || [])
    .filter((event) => event.status === BREAK_STATUS.SCHEDULED)
    .sort((a, b) => (a.plannedStartElapsedMs ?? Infinity) - (b.plannedStartElapsedMs ?? Infinity))[0] || null
);

export const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const createTimedBreakViewState = (state) => ({
  ...state,
  isBreakMode: isBreakModePhase(state.phase),
  isBlocking: isBreakBlockingPhase(state.phase),
  formattedRemaining: formatCountdown(state.remainingMs),
  formattedDecisionRemaining: formatCountdown(Math.max(0, BREAK_DECISION_WAIT_MS - state.decisionElapsedMs)),
});
