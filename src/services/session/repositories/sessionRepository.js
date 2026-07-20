/**
 * Asynchronous repository contract for study sessions and metric samples.
 * Future implementations may store records in memory, IndexedDB, Supabase, or another backend.
 * Implementations must keep session records separate from metric samples so they can map cleanly to:
 *
 * study_sessions
 * metric_samples
 *
 * @typedef {Object} SessionRepository
 * @property {(session:Object) => Promise<Object>} createSession
 * @property {(sessionId:string, updates:Object) => Promise<Object>} updateSession
 * @property {(sessionId:string, samples:Array<Object>) => Promise<Array<Object>>} appendMetricSamples
 * @property {(sessionId:string, completedSession:Object) => Promise<Object>} completeSession
 * @property {(options?:Object) => Promise<Array<Object>>} listSessionSummaries
 * @property {(sessionId:string) => Promise<Object|null>} getSessionById
 * @property {(sessionId:string) => Promise<Array<Object>>} getMetricSamples
 * @property {(sessionId:string) => Promise<boolean>} deleteSession
 * @property {() => Promise<void>} clear
 */

export const SESSION_REPOSITORY_METHODS = Object.freeze([
  "createSession",
  "updateSession",
  "appendMetricSamples",
  "completeSession",
  "listSessionSummaries",
  "getSessionById",
  "getMetricSamples",
  "deleteSession",
  "clear",
]);

/** Validate that an object exposes the repository contract. @param {Object} repository */
export const validateSessionRepositoryContract = (repository) => {
  const missing = SESSION_REPOSITORY_METHODS.filter((method) => typeof repository?.[method] !== "function");
  return { valid: missing.length === 0, missing };
};
