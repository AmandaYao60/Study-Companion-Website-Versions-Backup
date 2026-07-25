import {
  BREAK_DURATION_STEP_MS,
  BREAK_EXTENSION_MS,
  BREAK_STATUS,
  INTERRUPTION_REASON,
  MAX_BREAK_DURATION_MS,
  MAX_BREAK_EXTENSION_COUNT,
  MAX_BREAK_FOCUS_DURATION_MS,
  MIN_BREAK_DURATION_MS,
  MIN_BREAK_FOCUS_DURATION_MS,
} from "./sessionConstants.js";

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const durationMs = (value, fallback = null) => (isFiniteNumber(value) && value >= 0 ? Math.round(value) : fallback);
const nullableText = (value) => (value === null || value === undefined || value === "" ? null : String(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isStepDuration = (value) => isFiniteNumber(value) && value % BREAK_DURATION_STEP_MS === 0;
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

export const getAllowedFocusDurations = () => {
  const values = [];
  for (let value = MIN_BREAK_FOCUS_DURATION_MS; value <= MAX_BREAK_FOCUS_DURATION_MS; value += BREAK_DURATION_STEP_MS) {
    values.push(value);
  }
  return values;
};

export const getAllowedBreakDurations = (focusDurationMs = MIN_BREAK_FOCUS_DURATION_MS) => {
  if (!isValidBreakFocusDuration(focusDurationMs)) return [MIN_BREAK_DURATION_MS];
  const maximum = Math.min(MAX_BREAK_DURATION_MS, Math.floor(focusDurationMs / 3));
  const values = [];
  for (let value = MIN_BREAK_DURATION_MS; value <= maximum; value += BREAK_DURATION_STEP_MS) {
    values.push(value);
  }
  return values;
};

export const isValidBreakFocusDuration = (focusDurationMs) => (
  isStepDuration(focusDurationMs) &&
  focusDurationMs >= MIN_BREAK_FOCUS_DURATION_MS &&
  focusDurationMs <= MAX_BREAK_FOCUS_DURATION_MS
);

export const isValidBreakDuration = (breakDurationMs, focusDurationMs) => (
  isStepDuration(breakDurationMs) &&
  breakDurationMs >= MIN_BREAK_DURATION_MS &&
  breakDurationMs <= MAX_BREAK_DURATION_MS &&
  breakDurationMs <= focusDurationMs / 3
);

export const coerceBreakDurationForFocus = (breakDurationMs, focusDurationMs) => {
  const allowed = getAllowedBreakDurations(focusDurationMs);
  const requested = isFiniteNumber(breakDurationMs) ? Math.round(breakDurationMs) : MIN_BREAK_DURATION_MS;
  const notAboveRequested = allowed.filter((value) => value <= requested);
  return notAboveRequested.at(-1) ?? allowed[0] ?? MIN_BREAK_DURATION_MS;
};

export const normalizeBreakPlanInput = (input = {}, options = {}) => {
  const source = isObject(input) ? input : {};
  const targetDurationMs = durationMs(
    source.targetDurationMs ?? source.targetDuration ?? options.targetDurationMs,
    null
  );
  const requestedFocusMs = durationMs(source.focusDurationMs ?? source.focusDuration, null);
  const requestedBreakMs = durationMs(source.breakDurationMs ?? source.breakDuration, 0);
  const enabled = source.enabled === true || (
    requestedFocusMs !== null &&
    requestedBreakMs > 0
  );

  if (!enabled) {
    return {
      targetDurationMs,
      focusDurationMs: null,
      breakDurationMs: 0,
      plannedBreakCount: 0,
    };
  }

  const focusDurationMs = isValidBreakFocusDuration(requestedFocusMs)
    ? requestedFocusMs
    : clamp(
      Math.round((requestedFocusMs || MIN_BREAK_FOCUS_DURATION_MS) / BREAK_DURATION_STEP_MS) * BREAK_DURATION_STEP_MS,
      MIN_BREAK_FOCUS_DURATION_MS,
      MAX_BREAK_FOCUS_DURATION_MS
    );
  const breakDurationMs = isValidBreakDuration(requestedBreakMs, focusDurationMs)
    ? requestedBreakMs
    : coerceBreakDurationForFocus(requestedBreakMs, focusDurationMs);
  const plannedBreakCount = derivePlannedBreakCount({ targetDurationMs, focusDurationMs, breakDurationMs });

  return {
    targetDurationMs,
    focusDurationMs,
    breakDurationMs,
    plannedBreakCount,
  };
};

export const normalizeSessionPlan = (input = {}, options = {}) => {
  const source = isObject(input) ? input : {};
  const normalized = normalizeBreakPlanInput(source, options);
  const derivedBreakCount = derivePlannedBreakCount(normalized);
  const plannedBreakCount = Number.isInteger(source.plannedBreakCount) && source.plannedBreakCount >= 0
    ? Math.min(source.plannedBreakCount, derivedBreakCount)
    : derivedBreakCount;

  return {
    targetDurationMs: normalized.targetDurationMs,
    focusDurationMs: normalized.focusDurationMs,
    breakDurationMs: normalized.breakDurationMs,
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
    warningShownAt: iso(source.warningShownAt, null),
    readyAt: iso(source.readyAt, null),
    baseDurationMs: durationMs(source.baseDurationMs, null),
    activeSegmentStartedAt: iso(source.activeSegmentStartedAt, null),
    activeSegmentDurationMs: durationMs(source.activeSegmentDurationMs, null),
    decisionStartedAt: iso(source.decisionStartedAt, null),
    decisionAlarmReplayedAt: iso(source.decisionAlarmReplayedAt, null),
    extensionCount: Math.min(
      MAX_BREAK_EXTENSION_COUNT,
      Math.max(0, Math.floor(durationMs(source.extensionCount, 0)))
    ),
    totalExtensionDurationMs: durationMs(source.totalExtensionDurationMs, 0),
    actualActiveBreakDurationMs: durationMs(source.actualActiveBreakDurationMs, 0),
    skipped: source.skipped === true,
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
      baseDurationMs: durationMs(input.baseDurationMs, event.baseDurationMs),
      activeSegmentStartedAt: iso(input.activeSegmentStartedAt, event.activeSegmentStartedAt),
      activeSegmentDurationMs: durationMs(input.activeSegmentDurationMs, event.activeSegmentDurationMs),
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
      actualActiveBreakDurationMs: durationMs(input.actualActiveBreakDurationMs, event.actualActiveBreakDurationMs),
      totalExtensionDurationMs: durationMs(input.totalExtensionDurationMs, event.totalExtensionDurationMs),
      activeSegmentStartedAt: null,
      activeSegmentDurationMs: null,
      decisionStartedAt: null,
      decisionAlarmReplayedAt: null,
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
      skipped: true,
      decisionStartedAt: null,
      decisionAlarmReplayedAt: null,
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
      activeSegmentStartedAt: null,
      activeSegmentDurationMs: null,
      decisionStartedAt: null,
      decisionAlarmReplayedAt: null,
    };
  })
);

export const markBreakWarningShown = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => ({
    ...event,
    warningShownAt: iso(input.warningShownAt, event.warningShownAt),
  }))
);

export const markBreakReady = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => {
    if (event.status !== BREAK_STATUS.SCHEDULED) return event;
    return {
      ...event,
      readyAt: iso(input.readyAt, event.readyAt),
      baseDurationMs: durationMs(input.baseDurationMs, event.baseDurationMs),
    };
  })
);

export const markBreakDecisionStarted = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => {
    if (event.status !== BREAK_STATUS.ACTIVE) return event;
    return {
      ...event,
      activeSegmentStartedAt: null,
      activeSegmentDurationMs: null,
      decisionStartedAt: iso(input.decisionStartedAt, event.decisionStartedAt),
      decisionAlarmReplayedAt: null,
    };
  })
);

export const markBreakDecisionAlarmReplayed = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => ({
    ...event,
    decisionAlarmReplayedAt: iso(input.decisionAlarmReplayedAt, event.decisionAlarmReplayedAt),
  }))
);

export const startBreakExtension = (session = {}, breakId, input = {}) => (
  updateBreakEvent(session, breakId, (event) => {
    if (event.status !== BREAK_STATUS.ACTIVE) throw new Error("Only an active planned break can be extended.");
    if ((event.extensionCount || 0) >= MAX_BREAK_EXTENSION_COUNT) throw new Error("Break extension limit reached.");
    const nextExtensionCount = Math.max(0, event.extensionCount || 0) + 1;
    return {
      ...event,
      extensionCount: nextExtensionCount,
      totalExtensionDurationMs: nextExtensionCount * BREAK_EXTENSION_MS,
      activeSegmentStartedAt: iso(input.activeSegmentStartedAt, null),
      activeSegmentDurationMs: durationMs(input.activeSegmentDurationMs, BREAK_EXTENSION_MS),
      decisionStartedAt: null,
      decisionAlarmReplayedAt: null,
    };
  })
);
