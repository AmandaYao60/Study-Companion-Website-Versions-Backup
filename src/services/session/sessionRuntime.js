import {
  DEFAULT_SAMPLE_INTERVAL_MS,
  SESSION_STATUS,
} from "./sessionConstants.js";
import { aggregateMetricObservations } from "./metricAggregation.js";
import {
  createCompletedStudySession,
  createStudySession,
  normalizeMetricObservation,
  normalizeStudySession,
  validateStudySession,
} from "./sessionSchema.js";
import { calculateSessionStatistics } from "./sessionStatistics.js";
import { generateSessionSummary } from "./sessionSummary.js";
import { normalizeBreakEvents, normalizeSessionPlan } from "./sessionBreaks.js";
import { createMemorySessionRepository } from "./repositories/memorySessionRepository.js";

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const isUsefulObservation = (observation) => (
  observation.dataValid ||
  observation.faceDetected ||
  Number.isFinite(observation.attention) ||
  Number.isFinite(observation.fatigue)
);

const isRecoverableSession = (session) => (
  session.status === SESSION_STATUS.ACTIVE ||
  (session.status === SESSION_STATUS.PAUSED && session.recoveryPending === true)
);

const checkpointTime = (session) => {
  const values = [session.lastCheckpointAt, session.updatedAt, session.startedAt]
    .map((value) => Date.parse(value || ""))
    .filter(Number.isFinite);
  return values.length > 0 ? Math.max(...values) : 0;
};

const sortRecoverableSessions = (sessions = []) => [...sessions].sort((a, b) => {
  const timeDiff = checkpointTime(b) - checkpointTime(a);
  if (timeDiff !== 0) return timeDiff;
  return String(a.id || "").localeCompare(String(b.id || ""));
});

const getSampleSequence = (samples = []) => samples.reduce((highest, sample) => {
  const match = String(sample.id || "").match(/-sample-(\d+)$/);
  if (!match) return highest;
  return Math.max(highest, Number(match[1]) || 0);
}, 0);

/**
 * Create a framework-independent runtime that connects session lifecycle, interval sampling, summaries, and repository storage.
 * @param {{repository?: Object, now?: Function, idFactory?: Function, sampleIntervalMs?: number}=} options
 */
export const createSessionRuntime = (options = {}) => {
  const repository = options.repository || createMemorySessionRepository();
  const now = options.now || (() => new Date().toISOString());
  const sampleIntervalMs = Number.isFinite(options.sampleIntervalMs)
    ? options.sampleIntervalMs
    : DEFAULT_SAMPLE_INTERVAL_MS;

  let activeSession = null;
  let activeSessionSamples = [];
  let completedSessions = [];
  let pendingObservations = [];
  let intervalStartedElapsedMs = null;
  let sampleSequence = 0;
  let flushPromise = Promise.resolve([]);
  let timingWritePromise = Promise.resolve(null);

  const getSnapshot = () => ({
    activeSession: clone(activeSession),
    activeSessionSamples: clone(activeSessionSamples),
    completedSessions: clone(completedSessions),
    pendingObservationCount: pendingObservations.length,
  });

  const refreshCompletedSessions = async () => {
    completedSessions = await repository.listSessionSummaries({ status: SESSION_STATUS.COMPLETED });
    return clone(completedSessions);
  };

  const refreshActiveSamples = async () => {
    if (!activeSession) {
      activeSessionSamples = [];
      return [];
    }
    activeSessionSamples = await repository.getMetricSamples(activeSession.id);
    sampleSequence = getSampleSequence(activeSessionSamples);
    return clone(activeSessionSamples);
  };

  const resetPendingInterval = () => {
    pendingObservations = [];
    intervalStartedElapsedMs = null;
  };

  const flushPendingObservations = async ({ force = false } = {}) => {
    flushPromise = flushPromise.then(async () => {
      if (!activeSession || pendingObservations.length === 0) return [];

      const observations = pendingObservations.map(normalizeMetricObservation);
      const first = observations[0];
      const last = observations[observations.length - 1];
      const intervalDuration = Math.max(0, last.elapsedMs - first.elapsedMs);

      if (!force && intervalDuration < sampleIntervalMs) return [];
      if (!observations.some(isUsefulObservation)) {
        resetPendingInterval();
        return [];
      }

      resetPendingInterval();
      sampleSequence += 1;

      const sample = aggregateMetricObservations(observations, {
        sessionId: activeSession.id,
        sampleId: `${activeSession.id}-sample-${sampleSequence}`,
        intervalStartedAt: first.recordedAt,
        intervalEndedAt: last.recordedAt,
        expectedObservationCount: observations.length,
        elapsedMs: last.elapsedMs,
        aggregationVersion: activeSession.aggregationVersion,
      });

      const appended = await repository.appendMetricSamples(activeSession.id, [sample]);
      activeSessionSamples = await repository.getMetricSamples(activeSession.id);
      return appended;
    });

    return flushPromise;
  };

  const queueTimingWrite = (operation) => {
    const run = timingWritePromise.catch(() => null).then(operation);
    timingWritePromise = run;
    return run;
  };

  const checkpointActiveSession = (accumulatedStudyMs = 0, input = {}) => queueTimingWrite(async () => {
    if (!activeSession || activeSession.status !== SESSION_STATUS.ACTIVE) return clone(activeSession);
    const checkpointedAt = input.checkpointedAt || now();
    activeSession = await repository.updateSession(activeSession.id, {
      accumulatedStudyMs,
      lastCheckpointAt: checkpointedAt,
      recoveryPending: false,
      updatedAt: checkpointedAt,
    });
    return clone(activeSession);
  });

  const loadRecoverableSession = async (session) => {
    const checkpointedAt = session.lastCheckpointAt || session.updatedAt || now();
    const recovered = await repository.updateSession(session.id, {
      status: SESSION_STATUS.PAUSED,
      accumulatedStudyMs: session.accumulatedStudyMs || 0,
      recoveryPending: true,
      lastCheckpointAt: checkpointedAt,
      updatedAt: now(),
    });
    activeSession = recovered;
    activeSessionSamples = await repository.getMetricSamples(recovered.id);
    sampleSequence = getSampleSequence(activeSessionSamples);
    resetPendingInterval();
    return clone(activeSession);
  };

  const findRecoverableSessions = async () => {
    const sessions = await repository.listSessionSummaries();
    const invalid = [];
    const recoverable = [];

    sessions.forEach((session) => {
      const normalized = normalizeStudySession(session);
      const validation = validateStudySession(normalized);
      if (!validation.valid) {
        invalid.push({ id: session?.id || null, errors: validation.errors });
        return;
      }
      if (isRecoverableSession(normalized)) recoverable.push(normalized);
    });

    return {
      recoverable: sortRecoverableSessions(recoverable),
      invalid,
    };
  };

  return {
    getSnapshot,

    async prepareSession(input = {}) {
      if (activeSession) return clone(activeSession);

      const startedAt = input.startedAt || now();
      const session = createStudySession({
        taskName: input.taskName || input.taskDescription || "",
        taskDescription: input.taskDescription || "",
        targetDurationMs: input.targetDurationMs ?? null,
        subject: input.subject ?? null,
        customSubject: input.customSubject ?? null,
        taskType: input.taskType ?? null,
        customTaskType: input.customTaskType ?? null,
        sessionGoal: input.sessionGoal ?? null,
        preSessionCheckIn: input.preSessionCheckIn ?? null,
        postSessionCheckOut: input.postSessionCheckOut ?? null,
        sessionPlan: input.sessionPlan ?? null,
        breakEvents: input.breakEvents ?? [],
        interruptions: input.interruptions ?? [],
        startedAt,
        createdAt: startedAt,
        updatedAt: startedAt,
        status: SESSION_STATUS.PREPARED,
        accumulatedStudyMs: 0,
        recoveryPending: false,
        lastCheckpointAt: null,
      }, {
        idFactory: options.idFactory,
        now: () => startedAt,
      });

      activeSession = await repository.createSession(session);
      activeSessionSamples = [];
      sampleSequence = 0;
      resetPendingInterval();
      return clone(activeSession);
    },

    async startSession(input = {}) {
      return this.prepareSession(input);
    },

    async activatePreparedSession() {
      if (!activeSession) return null;
      if (activeSession.status === SESSION_STATUS.ACTIVE) return clone(activeSession);
      activeSession = await queueTimingWrite(async () => repository.updateSession(activeSession.id, {
        status: SESSION_STATUS.ACTIVE,
        recoveryPending: false,
        lastCheckpointAt: now(),
        updatedAt: now(),
      }));
      return clone(activeSession);
    },

    async checkpointActiveSession(accumulatedStudyMs = 0, input = {}) {
      return checkpointActiveSession(accumulatedStudyMs, input);
    },

    async initializeSessionState({ recoverInterrupted = true } = {}) {
      await refreshCompletedSessions();
      activeSession = null;
      activeSessionSamples = [];
      sampleSequence = 0;
      resetPendingInterval();

      if (!recoverInterrupted) {
        return {
          completedSessions: clone(completedSessions),
          recoveredSession: null,
          recoverableSessionCount: 0,
          invalidRecoverableSessions: [],
        };
      }

      const { recoverable, invalid } = await findRecoverableSessions();
      if (recoverable.length === 0) {
        return {
          completedSessions: clone(completedSessions),
          recoveredSession: null,
          recoverableSessionCount: 0,
          invalidRecoverableSessions: invalid,
        };
      }

      if (recoverable.length > 1 && typeof console !== "undefined") {
        console.warn(`Multiple recoverable study sessions found. Recovering newest session ${recoverable[0].id} and leaving ${recoverable.length - 1} untouched.`);
      }

      const recoveredSession = await loadRecoverableSession(recoverable[0]);
      return {
        completedSessions: clone(completedSessions),
        recoveredSession,
        recoverableSessionCount: recoverable.length,
        invalidRecoverableSessions: invalid,
      };
    },

    async pauseSession(accumulatedStudyMs = 0) {
      if (!activeSession) return null;
      if (activeSession.status === SESSION_STATUS.PREPARED) return clone(activeSession);
      await flushPendingObservations({ force: true });
      const checkpointedAt = now();
      activeSession = await queueTimingWrite(async () => repository.updateSession(activeSession.id, {
        status: SESSION_STATUS.PAUSED,
        accumulatedStudyMs,
        recoveryPending: false,
        lastCheckpointAt: checkpointedAt,
        updatedAt: checkpointedAt,
      }));
      return clone(activeSession);
    },

    async resumeSession() {
      if (!activeSession) return null;
      const checkpointedAt = now();
      activeSession = await queueTimingWrite(async () => repository.updateSession(activeSession.id, {
        status: SESSION_STATUS.ACTIVE,
        recoveryPending: false,
        lastCheckpointAt: checkpointedAt,
        updatedAt: checkpointedAt,
      }));
      return clone(activeSession);
    },

    async updateSessionTask(taskDescription = "") {
      if (!activeSession) return null;
      activeSession = await repository.updateSession(activeSession.id, {
        taskDescription,
        updatedAt: now(),
      });
      return clone(activeSession);
    },

    async updateTargetDuration(targetDurationMs = null) {
      if (!activeSession) return null;
      activeSession = await repository.updateSession(activeSession.id, {
        targetDurationMs,
        sessionPlan: normalizeSessionPlan(activeSession.sessionPlan, { targetDurationMs }),
        updatedAt: now(),
      });
      return clone(activeSession);
    },

    async updateSessionPlan(sessionPlan = null) {
      if (!activeSession) return null;
      activeSession = await repository.updateSession(activeSession.id, {
        sessionPlan: normalizeSessionPlan(sessionPlan, { targetDurationMs: activeSession.targetDurationMs }),
        updatedAt: now(),
      });
      return clone(activeSession);
    },

    async updateBreakEvents(breakEvents = [], input = {}) {
      if (!activeSession) return null;
      const updatedAt = input.updatedAt || now();
      activeSession = await repository.updateSession(activeSession.id, {
        breakEvents: normalizeBreakEvents(breakEvents),
        ...(Number.isFinite(input.accumulatedStudyMs) ? { accumulatedStudyMs: input.accumulatedStudyMs } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.recoveryPending !== undefined ? { recoveryPending: input.recoveryPending === true } : {}),
        ...(input.lastCheckpointAt !== undefined ? { lastCheckpointAt: input.lastCheckpointAt } : {}),
        updatedAt,
      });
      return clone(activeSession);
    },

    async appendObservation(observation) {
      if (!activeSession || activeSession.status !== SESSION_STATUS.ACTIVE) return [];
      const normalized = normalizeMetricObservation(observation);
      pendingObservations.push(normalized);

      if (intervalStartedElapsedMs === null) {
        intervalStartedElapsedMs = normalized.elapsedMs;
      }

      if (normalized.elapsedMs - intervalStartedElapsedMs >= sampleIntervalMs) {
        return flushPendingObservations();
      }

      return [];
    },

    async flushPendingObservations(options = {}) {
      return flushPendingObservations(options);
    },

    async finishSession(actualDurationMs = 0, completionInput = {}) {
      if (!activeSession) return null;
      await timingWritePromise.catch(() => null);
      await flushPendingObservations({ force: true });
      const endedAt = now();
      const sessionForStats = {
        ...activeSession,
        status: SESSION_STATUS.COMPLETED,
        endedAt,
        actualDurationMs,
        accumulatedStudyMs: actualDurationMs,
        recoveryPending: false,
        postSessionCheckOut: completionInput.postSessionCheckOut ?? activeSession.postSessionCheckOut,
      };
      const samples = await repository.getMetricSamples(activeSession.id);
      const statistics = calculateSessionStatistics(samples, sessionForStats);
      const summary = generateSessionSummary({ statistics, session: sessionForStats, now });
      const completed = createCompletedStudySession(sessionForStats, {
        endedAt,
        actualDurationMs,
        monitoredDurationMs: statistics.monitoredDurationMs,
        statistics,
        summary,
        sampleCount: samples.length,
        dataCoverage: statistics.dataCoverage,
        postSessionCheckOut: completionInput.postSessionCheckOut ?? activeSession.postSessionCheckOut,
      });

      const saved = await repository.completeSession(activeSession.id, completed);
      activeSession = null;
      activeSessionSamples = [];
      resetPendingInterval();
      await refreshCompletedSessions();
      return clone(saved);
    },

    async discardSession() {
      if (!activeSession) return false;
      const sessionId = activeSession.id;
      const deleted = await repository.deleteSession(sessionId);
      activeSession = null;
      activeSessionSamples = [];
      resetPendingInterval();
      return deleted;
    },

    async listCompletedSessions() {
      return refreshCompletedSessions();
    },

    async getSessionById(sessionId) {
      return repository.getSessionById(sessionId);
    },

    async getMetricSamples(sessionId) {
      return repository.getMetricSamples(sessionId);
    },

    async clear() {
      await repository.clear();
      activeSession = null;
      activeSessionSamples = [];
      completedSessions = [];
      sampleSequence = 0;
      resetPendingInterval();
    },

    async refreshActiveSamples() {
      return refreshActiveSamples();
    },
  };
};
