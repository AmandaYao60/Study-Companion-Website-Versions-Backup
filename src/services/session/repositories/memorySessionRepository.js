import { SESSION_STATUS } from "../sessionConstants.js";
import {
  createCompletedStudySession,
  normalizeMetricSample,
  normalizeStudySession,
  validateMetricSample,
  validateStudySession,
} from "../sessionSchema.js";
import { sortSessionsByNewest } from "../sessionSelectors.js";

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const ensureValidSession = (session) => {
  const normalized = normalizeStudySession(session);
  const validation = validateStudySession(normalized);
  if (!validation.valid) throw new Error(`Invalid session: ${validation.errors.join(" ")}`);
  return normalized;
};

const ensureValidSample = (sample) => {
  const normalized = normalizeMetricSample(sample);
  const validation = validateMetricSample(normalized);
  if (!validation.valid) throw new Error(`Invalid metric sample: ${validation.errors.join(" ")}`);
  return normalized;
};

const sortSamples = (samples) => [...samples].sort((a, b) => {
  const startDiff = Date.parse(a.intervalStartedAt) - Date.parse(b.intervalStartedAt);
  if (startDiff !== 0) return startDiff;
  return String(a.id).localeCompare(String(b.id));
});

/** Create an independent in-memory repository instance. @returns {import("./sessionRepository.js").SessionRepository} */
export const createMemorySessionRepository = () => {
  const sessions = new Map();
  const samplesBySession = new Map();

  return {
    async createSession(session) {
      const normalized = ensureValidSession(session);
      if (sessions.has(normalized.id)) throw new Error(`Session already exists: ${normalized.id}`);
      sessions.set(normalized.id, clone(normalized));
      samplesBySession.set(normalized.id, []);
      return clone(normalized);
    },

    async updateSession(sessionId, updates) {
      if (!sessions.has(sessionId)) throw new Error(`Session not found: ${sessionId}`);
      const merged = ensureValidSession({ ...sessions.get(sessionId), ...updates, id: sessionId });
      sessions.set(sessionId, clone(merged));
      return clone(merged);
    },

    async appendMetricSamples(sessionId, samples = []) {
      if (!sessions.has(sessionId)) throw new Error(`Session not found: ${sessionId}`);
      const existing = samplesBySession.get(sessionId) || [];
      const existingIds = new Set(existing.map((sample) => sample.id));
      const normalizedSamples = samples.map(ensureValidSample);
      normalizedSamples.forEach((sample) => {
        if (sample.sessionId !== sessionId) throw new Error(`MetricSample ${sample.id} belongs to ${sample.sessionId}, not ${sessionId}.`);
        if (existingIds.has(sample.id)) throw new Error(`MetricSample already exists: ${sample.id}`);
        existingIds.add(sample.id);
      });
      const nextSamples = sortSamples([...existing, ...normalizedSamples]);
      samplesBySession.set(sessionId, clone(nextSamples));
      return clone(normalizedSamples);
    },

    async completeSession(sessionId, completedSession) {
      if (!sessions.has(sessionId)) throw new Error(`Session not found: ${sessionId}`);
      const completed = completedSession.status === SESSION_STATUS.COMPLETED
        ? ensureValidSession(completedSession)
        : createCompletedStudySession({ ...sessions.get(sessionId), id: sessionId }, completedSession);
      if (completed.id !== sessionId) throw new Error(`Completed session id ${completed.id} does not match ${sessionId}.`);
      sessions.set(sessionId, clone(completed));
      return clone(completed);
    },

    async listSessionSummaries(options = {}) {
      let list = sortSessionsByNewest(Array.from(sessions.values()));
      if (options.status) list = list.filter((session) => session.status === options.status);
      if (Number.isFinite(options.limit)) list = list.slice(0, Math.max(0, Math.floor(options.limit)));
      return clone(list);
    },

    async getSessionById(sessionId) {
      return clone(sessions.get(sessionId) || null);
    },

    async getMetricSamples(sessionId) {
      return clone(sortSamples(samplesBySession.get(sessionId) || []));
    },

    async deleteSession(sessionId) {
      const existed = sessions.delete(sessionId);
      samplesBySession.delete(sessionId);
      return existed;
    },

    async clear() {
      sessions.clear();
      samplesBySession.clear();
    },
  };
};
