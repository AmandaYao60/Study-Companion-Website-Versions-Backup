import { SESSION_STATUS } from "../sessionConstants.js";
import {
  createCompletedStudySession,
  normalizeMetricSample,
  normalizeStudySession,
  validateMetricSample,
  validateStudySession,
} from "../sessionSchema.js";
import { sortSessionsByNewest } from "../sessionSelectors.js";

export const INDEXED_DB_SESSION_DATABASE = Object.freeze({
  name: "aegismind-session-data",
  version: 1,
  stores: {
    sessions: "study_sessions",
    samples: "metric_samples",
  },
  indexes: {
    sessionsByStatus: "by_status",
    sessionsByStartedAt: "by_started_at",
    samplesBySessionId: "by_session_id",
    samplesBySessionInterval: "by_session_interval",
  },
});

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

const toError = (error, fallbackMessage) => {
  if (error instanceof Error) return error;
  if (error?.message) return new Error(error.message);
  if (error?.name) return new Error(error.name);
  return new Error(fallbackMessage);
};

const describeFailure = (operation, error) => {
  const cause = toError(error, "Unknown IndexedDB error.");
  return new Error(`IndexedDB session repository failed during ${operation}: ${cause.message}`);
};

const requestToPromise = (request, operation) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(describeFailure(operation, request.error));
});

const waitForTransaction = (transaction, operation, getFailure) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(describeFailure(operation, getFailure() || transaction.error));
  transaction.onabort = () => reject(describeFailure(operation, getFailure() || transaction.error));
});

const getIndexedDbFactory = (providedFactory) => {
  if (providedFactory) return providedFactory;
  if (typeof indexedDB !== "undefined") return indexedDB;
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) return globalThis.indexedDB;
  throw new Error("IndexedDB is unavailable in this browser context.");
};

const ensureStore = (database, storeName, options) => (
  database.objectStoreNames.contains(storeName)
    ? null
    : database.createObjectStore(storeName, options)
);

const ensureIndex = (store, indexName, keyPath, options) => {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, options);
  }
};

/** Create a native browser IndexedDB session repository. @returns {import("./sessionRepository.js").SessionRepository} */
export const createIndexedDbSessionRepository = (options = {}) => {
  const config = {
    ...INDEXED_DB_SESSION_DATABASE,
    name: options.databaseName || INDEXED_DB_SESSION_DATABASE.name,
    version: options.databaseVersion || INDEXED_DB_SESSION_DATABASE.version,
  };
  const indexedDbFactory = options.indexedDB || null;
  let database = null;
  let openPromise = null;

  const clearCachedConnection = () => {
    database = null;
    openPromise = null;
  };

  const openDatabase = async () => {
    if (database) return database;
    if (openPromise) return openPromise;

    openPromise = new Promise((resolve, reject) => {
      let settled = false;
      const rejectOpen = (error) => {
        if (settled) return;
        settled = true;
        clearCachedConnection();
        reject(describeFailure("opening database", error));
      };

      let request;
      try {
        request = getIndexedDbFactory(indexedDbFactory).open(config.name, config.version);
      } catch (error) {
        rejectOpen(error);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        const sessionStore = ensureStore(db, config.stores.sessions, { keyPath: "id" }) ||
          request.transaction.objectStore(config.stores.sessions);
        const sampleStore = ensureStore(db, config.stores.samples, { keyPath: "id" }) ||
          request.transaction.objectStore(config.stores.samples);

        ensureIndex(sessionStore, config.indexes.sessionsByStatus, "status", { unique: false });
        ensureIndex(sessionStore, config.indexes.sessionsByStartedAt, "startedAt", { unique: false });
        ensureIndex(sampleStore, config.indexes.samplesBySessionId, "sessionId", { unique: false });
        ensureIndex(sampleStore, config.indexes.samplesBySessionInterval, ["sessionId", "intervalStartedAt"], { unique: false });
      };

      request.onerror = () => rejectOpen(request.error);
      request.onblocked = () => rejectOpen(new Error("Database open was blocked by another tab or stale connection."));
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        database = request.result;
        database.onversionchange = () => {
          database.close();
          clearCachedConnection();
        };
        resolve(database);
      };
    });

    return openPromise.catch((error) => {
      clearCachedConnection();
      throw error;
    });
  };

  const transactionDone = async (storeNames, mode, operation, executor) => {
    const db = await openDatabase();
    let failure = null;
    let result;
    const transaction = db.transaction(storeNames, mode);
    const fail = (error) => {
      failure = toError(error, `IndexedDB ${operation} failed.`);
      try {
        transaction.abort();
      } catch {
        // The transaction may already be completing or aborted.
      }
    };
    const done = waitForTransaction(transaction, operation, () => failure);

    try {
      executor(transaction, (value) => {
        result = value;
      }, fail);
    } catch (error) {
      fail(error);
    }

    await done;
    return clone(result);
  };

  const readonlyRequest = async (storeName, operation, executor) => {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readonly");
    const done = waitForTransaction(transaction, operation, () => null);
    const store = transaction.objectStore(storeName);
    const request = executor(store);
    const result = await requestToPromise(request, operation);
    await done;
    return clone(result);
  };

  return {
    async createSession(session) {
      const normalized = ensureValidSession(session);
      return transactionDone(config.stores.sessions, "readwrite", "creating session", (transaction, setResult) => {
        const store = transaction.objectStore(config.stores.sessions);
        store.add(clone(normalized));
        setResult(normalized);
      }).catch((error) => {
        if (error.message.includes("ConstraintError")) {
          throw new Error(`Session already exists: ${normalized.id}`);
        }
        throw error;
      });
    },

    async updateSession(sessionId, updates) {
      return transactionDone(config.stores.sessions, "readwrite", "updating session", (transaction, setResult, fail) => {
        const store = transaction.objectStore(config.stores.sessions);
        const request = store.get(sessionId);
        request.onsuccess = () => {
          try {
            const existing = request.result;
            if (!existing) {
              fail(new Error(`Session not found: ${sessionId}`));
              return;
            }
            const merged = ensureValidSession({ ...existing, ...updates, id: sessionId });
            store.put(clone(merged));
            setResult(merged);
          } catch (error) {
            fail(error);
          }
        };
        request.onerror = () => fail(request.error);
      });
    },

    async appendMetricSamples(sessionId, samples = []) {
      const normalizedSamples = samples.map(ensureValidSample);
      const batchIds = new Set();
      normalizedSamples.forEach((sample) => {
        if (sample.sessionId !== sessionId) throw new Error(`MetricSample ${sample.id} belongs to ${sample.sessionId}, not ${sessionId}.`);
        if (batchIds.has(sample.id)) throw new Error(`Duplicate MetricSample in append batch: ${sample.id}`);
        batchIds.add(sample.id);
      });

      return transactionDone(
        [config.stores.sessions, config.stores.samples],
        "readwrite",
        "appending metric samples",
        (transaction, setResult, fail) => {
          const sessionStore = transaction.objectStore(config.stores.sessions);
          const sampleStore = transaction.objectStore(config.stores.samples);
          const sessionRequest = sessionStore.get(sessionId);
          sessionRequest.onsuccess = () => {
            try {
              if (!sessionRequest.result) {
                fail(new Error(`Session not found: ${sessionId}`));
                return;
              }

              if (normalizedSamples.length === 0) {
                setResult([]);
                return;
              }

              let checkedCount = 0;
              const markChecked = () => {
                checkedCount += 1;
                if (checkedCount !== normalizedSamples.length) return;
                normalizedSamples.forEach((sample) => sampleStore.add(clone(sample)));
                setResult(normalizedSamples);
              };

              normalizedSamples.forEach((sample) => {
                const duplicateRequest = sampleStore.get(sample.id);
                duplicateRequest.onsuccess = () => {
                  try {
                    if (duplicateRequest.result) {
                      fail(new Error(`MetricSample already exists: ${sample.id}`));
                      return;
                    }
                    markChecked();
                  } catch (error) {
                    fail(error);
                  }
                };
                duplicateRequest.onerror = () => fail(duplicateRequest.error);
              });
            } catch (error) {
              fail(error);
            }
          };
          sessionRequest.onerror = () => fail(sessionRequest.error);
        }
      );
    },

    async completeSession(sessionId, completedSession) {
      return transactionDone(config.stores.sessions, "readwrite", "completing session", (transaction, setResult, fail) => {
        const store = transaction.objectStore(config.stores.sessions);
        const request = store.get(sessionId);
        request.onsuccess = () => {
          try {
            const existing = request.result;
            if (!existing) {
              fail(new Error(`Session not found: ${sessionId}`));
              return;
            }
            const completed = completedSession.status === SESSION_STATUS.COMPLETED
              ? ensureValidSession(completedSession)
              : createCompletedStudySession({ ...existing, id: sessionId }, completedSession);
            if (completed.id !== sessionId) {
              fail(new Error(`Completed session id ${completed.id} does not match ${sessionId}.`));
              return;
            }
            store.put(clone(completed));
            setResult(completed);
          } catch (error) {
            fail(error);
          }
        };
        request.onerror = () => fail(request.error);
      });
    },

    async listSessionSummaries(options = {}) {
      const sessions = await readonlyRequest(config.stores.sessions, "listing session summaries", (store) => (
        options.status
          ? store.index(config.indexes.sessionsByStatus).getAll(options.status)
          : store.getAll()
      ));
      let list = sortSessionsByNewest(sessions || []);
      if (options.status) list = list.filter((session) => session.status === options.status);
      if (Number.isFinite(options.limit)) list = list.slice(0, Math.max(0, Math.floor(options.limit)));
      return clone(list);
    },

    async getSessionById(sessionId) {
      return await readonlyRequest(config.stores.sessions, "getting session by id", (store) => store.get(sessionId)) || null;
    },

    async getMetricSamples(sessionId) {
      const samples = await readonlyRequest(config.stores.samples, "getting metric samples", (store) => (
        store.index(config.indexes.samplesBySessionId).getAll(sessionId)
      ));
      return clone(sortSamples((samples || []).filter((sample) => sample.sessionId === sessionId)));
    },

    async deleteSession(sessionId) {
      return transactionDone(
        [config.stores.sessions, config.stores.samples],
        "readwrite",
        "deleting session",
        (transaction, setResult, fail) => {
          const sessionStore = transaction.objectStore(config.stores.sessions);
          const sampleStore = transaction.objectStore(config.stores.samples);
          const sessionRequest = sessionStore.get(sessionId);
          sessionRequest.onsuccess = () => {
            try {
              if (!sessionRequest.result) {
                setResult(false);
                return;
              }
              const keyRequest = sampleStore.index(config.indexes.samplesBySessionId).getAllKeys(sessionId);
              keyRequest.onsuccess = () => {
                try {
                  keyRequest.result.forEach((sampleId) => sampleStore.delete(sampleId));
                  sessionStore.delete(sessionId);
                  setResult(true);
                } catch (error) {
                  fail(error);
                }
              };
              keyRequest.onerror = () => fail(keyRequest.error);
            } catch (error) {
              fail(error);
            }
          };
          sessionRequest.onerror = () => fail(sessionRequest.error);
        }
      );
    },

    async clear() {
      await transactionDone(
        [config.stores.sessions, config.stores.samples],
        "readwrite",
        "clearing session data",
        (transaction, setResult) => {
          transaction.objectStore(config.stores.samples).clear();
          transaction.objectStore(config.stores.sessions).clear();
          setResult(undefined);
        }
      );
    },
  };
};
