import { BREAK_STATUS, INTERRUPTION_REASON } from "./sessionConstants.js";

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const durationMs = (value, fallback = null) => (isFiniteNumber(value) && value >= 0 ? Math.round(value) : fallback);
const nullableText = (value) => (value === null || value === undefined || value === "" ? null : String(value));
const iso = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : fallback;
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};

let generatedBreakIdCounter = 0;
const createBreakId = () => {
  generatedBreakIdCounter += 1;
  return `break-${Date.now()}-${generatedBreakIdCounter}`;
};

let generatedInterruptionIdCounter = 0;
const createInterruptionId = () => {
  generatedInterruptionIdCounter += 1;
  return `interruption-${Date.now()}-${generatedInterruptionIdCounter}`;
};

export const derivePlannedBreakCount = ({
  targetDurationMs = null,
  focusDurationMs = null,
  breakDurationMs = null,
} = {}) => {
  if (!isFiniteNumber(targetDurationMs) || targetDurationMs <= 0) return 0;
  if (!isFiniteNumber(focusDurationMs) || focusDurationMs <= 0) return 0;
  if (!isFiniteNumber(breakDurationMs) || breakDurationMs <= 0) return 0;
  return Math.max(0, Math.floor((targetDurationMs - 1) / focusDurationMs));
};

export const normalizeSessionPlan = (input = {}, options = {}) => {
  const source = isObject(input) ? input : {};
  const targetDurationMs = durationMs(
    source.targetDurationMs ?? source.targetDuration ?? options.targetDurationMs,
    null
  );
  const focusDurationMs = durationMs(source.focusDurationMs ?? source.focusDuration, null);
  const breakDurationMs = durationMs(source.breakDurationMs ?? source.breakDuration, 0);
  const derivedBreakCount = derivePlannedBreakCount({ targetDurationMs, focusDurationMs, breakDurationMs });
  const plannedBreakCount = Number.isInteger(source.plannedBreakCount) && source.plannedBreakCount >= 0
    ? source.plannedBreakCount
    : derivedBreakCount;

  return {
    targetDurationMs,
    focusDurationMs,
    breakDurationMs,
    plannedBreakCount,
  };
};

export const calculatePlannedBreakPositions = (plan = {}) => {
  const normalized = normalizeSessionPlan(plan);
  if (
    !isFiniteNumber(normalized.focusDurationMs) ||
    normalized.focusDurationMs <= 0 ||
    normalized.plannedBreakCount <= 0
  ) {
    return [];
  }

  return Array.from({ length: normalized.plannedBreakCount }, (_, index) => (
    normalized.focusDurationMs * (index + 1)
  )).filter((position) => (
    !isFiniteNumber(normalized.targetDurationMs) || position < normalized.targetDurationMs
  ));
};

export const normalizeBreakEvent = (input = {}, options = {}) => {
  const source = isObject(input) ? input : {};
  const statusValues = new Set(Object.values(BREAK_STATUS));
  return {
    ...source,
    id: nonEmpty(source.id) ? source.id : (options.idFactory || createBreakId)(),
    plannedStartElapsedMs: durationMs(source.plannedStartElapsedMs ?? source.plannedStart, null),
    plannedStartAt: iso(source.plannedStartAt, null),
    actualStartElapsedMs: durationMs(source.actualStartElapsedMs ?? source.actualStart, null),
    actualStartAt: iso(source.actualStartAt, null),
    actualEndElapsedMs: durationMs(source.actualEndElapsedMs ?? source.actualEnd, null),
    actualEndAt: iso(source.actualEndAt, null),
    status: statusValues.has(source.status) ? source.status : BREAK_STATUS.SCHEDULED,
  };
};

export const normalizeBreakEvents = (input = [], options = {}) => (
  Array.isArray(input) ? input.map((event) => normalizeBreakEvent(event, options)) : []
);

export const normalizeInterruption = (input = {}, options = {}) => {
  const source = isObject(input) ? input : {};
  const reasonValues = new Set(Object.values(INTERRUPTION_REASON));
  return {
    ...source,
    id: nonEmpty(source.id) ? source.id : (options.idFactory || createInterruptionId)(),
    startElapsedMs: durationMs(source.startElapsedMs ?? source.start, null),
    startAt: iso(source.startAt, null),
    endElapsedMs: durationMs(source.endElapsedMs ?? source.end, null),
    endAt: iso(source.endAt, null),
    reason: reasonValues.has(source.reason) ? source.reason : INTERRUPTION_REASON.MANUAL_PAUSE,
  };
};

export const normalizeInterruptions = (input = [], options = {}) => (
  Array.isArray(input) ? input.map((event) => normalizeInterruption(event, options)) : []
);

export const restoreBreakState = (session = {}) => ({
  ...session,
  sessionPlan: normalizeSessionPlan(session.sessionPlan, { targetDurationMs: session.targetDurationMs }),
  breakEvents: normalizeBreakEvents(session.breakEvents),
  interruptions: normalizeInterruptions(session.interruptions),
});

export const getNextScheduledBreak = (session = {}, elapsedMs = 0) => {
  const events = normalizeBreakEvents(session.breakEvents);
  return events
    .filter((event) => event.status === BREAK_STATUS.SCHEDULED)
    .filter((event) => !isFiniteNumber(event.plannedStartElapsedMs) || event.plannedStartElapsedMs >= elapsedMs)
    .sort((a, b) => {
      const diff = (a.plannedStartElapsedMs ?? Number.POSITIVE_INFINITY) -
        (b.plannedStartElapsedMs ?? Number.POSITIVE_INFINITY);
      if (diff !== 0) return diff;
      return String(a.id).localeCompare(String(b.id));
    })[0] || null;
};

const ensureNoActiveBreak = (events, ignoredId = null) => {
  const active = events.find((event) => event.status === BREAK_STATUS.ACTIVE && event.id !== ignoredId);
  if (active) throw new Error("Another planned break is already active.");
};

const updateBreakEvent = (session, breakId, updater) => {
  const events = normalizeBreakEvents(session.breakEvents);
  const index = events.findIndex((event) => event.id === breakId);
  if (index < 0) throw new Error(`Break event not found: ${breakId}`);
  const nextEvents = [...events];
  nextEvents[index] = updater(events[index], events);
  return {
    ...session,
    breakEvents: nextEvents,
  };
};

export const startPlannedBreak = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event, events) => {
    if (event.status === BREAK_STATUS.ACTIVE) return event;
    if (event.status !== BREAK_STATUS.SCHEDULED) {
      throw new Error("Only a scheduled planned break can be started.");
    }
    ensureNoActiveBreak(events, event.id);
    return {
      ...event,
      status: BREAK_STATUS.ACTIVE,
      actualStartElapsedMs: durationMs(input.actualStartElapsedMs ?? input.actualStart, event.actualStartElapsedMs),
      actualStartAt: iso(input.actualStartAt, event.actualStartAt),
    };
  })
);

export const completeBreak = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => {
    if (event.status !== BREAK_STATUS.ACTIVE) {
      throw new Error("Only an active planned break can be completed.");
    }
    return {
      ...event,
      status: BREAK_STATUS.COMPLETED,
      actualEndElapsedMs: durationMs(input.actualEndElapsedMs ?? input.actualEnd, event.actualEndElapsedMs),
      actualEndAt: iso(input.actualEndAt, event.actualEndAt),
    };
  })
);

export const skipBreak = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => {
    if (![BREAK_STATUS.SCHEDULED, BREAK_STATUS.ACTIVE].includes(event.status)) {
      throw new Error("Only scheduled or active planned breaks can be skipped.");
    }
    return {
      ...event,
      status: BREAK_STATUS.SKIPPED,
      actualEndElapsedMs: durationMs(input.actualEndElapsedMs ?? input.actualEnd, event.actualEndElapsedMs),
      actualEndAt: iso(input.actualEndAt, event.actualEndAt),
    };
  })
);

export const cancelBreak = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => {
    if (event.status === BREAK_STATUS.COMPLETED) {
      throw new Error("A completed planned break cannot be cancelled.");
    }
    return {
      ...event,
      status: BREAK_STATUS.CANCELLED,
      actualEndElapsedMs: durationMs(input.actualEndElapsedMs ?? input.actualEnd, event.actualEndElapsedMs),
      actualEndAt: iso(input.actualEndAt, event.actualEndAt),
    };
  })
);
