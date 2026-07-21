import {
  DEFAULT_SAMPLE_INTERVAL_MS,
  SESSION_STATUS,
} from "./sessionConstants.js";
import { aggregateMetricObservations } from "./metricAggregation.js";
import {
  createCompletedStudySession,
  createStudySession,
  normalizeMetricObservation,
} from "./sessionSchema.js";
import { calculateSessionStatistics } from "./sessionStatistics.js";
import { generateSessionSummary } from "./sessionSummary.js";
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

  return {
    getSnapshot,

    async prepareSession(input = {}) {
      if (activeSession) return clone(activeSession);

      const startedAt = input.startedAt || now();
      const session = createStudySession({
        taskDescription: input.taskDescription || "",
        targetDurationMs: input.targetDurationMs ?? null,
        preSessionCheckIn: input.preSessionCheckIn ?? null,
        startedAt,
        createdAt: startedAt,
        updatedAt: startedAt,
        status: SESSION_STATUS.PREPARED,
        accumulatedStudyMs: 0,
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
      activeSession = await repository.updateSession(activeSession.id, {
        status: SESSION_STATUS.ACTIVE,
        updatedAt: now(),
      });
      return clone(activeSession);
    },

    async pauseSession(accumulatedStudyMs = 0) {
      if (!activeSession) return null;
      if (activeSession.status === SESSION_STATUS.PREPARED) return clone(activeSession);
      activeSession = await repository.updateSession(activeSession.id, {
        status: SESSION_STATUS.PAUSED,
        accumulatedStudyMs,
        updatedAt: now(),
      });
      return clone(activeSession);
    },

    async resumeSession() {
      if (!activeSession) return null;
      activeSession = await repository.updateSession(activeSession.id, {
        status: SESSION_STATUS.ACTIVE,
        updatedAt: now(),
      });
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
        updatedAt: now(),
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

    async finishSession(actualDurationMs = 0) {
      if (!activeSession) return null;
      await flushPendingObservations({ force: true });
      const endedAt = now();
      const sessionForStats = {
        ...activeSession,
        status: SESSION_STATUS.COMPLETED,
        endedAt,
        actualDurationMs,
      };
      const samples = await repository.getMetricSamples(activeSession.id);
      const statistics = calculateSessionStatistics(samples, sessionForStats);
      const summary = generateSessionSummary({ statistics, session: sessionForStats, now });
      const completed = createCompletedStudySession(activeSession, {
        endedAt,
        actualDurationMs,
        monitoredDurationMs: statistics.monitoredDurationMs,
        statistics,
        summary,
        sampleCount: samples.length,
        dataCoverage: statistics.dataCoverage,
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
