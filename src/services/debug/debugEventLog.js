export const DEBUG_EVENT_LOG_CAPACITY = 100;
export const DEBUG_EVENT_DUPLICATE_WINDOW_MS = 1000;

const LOG_TYPES = new Set(["debug", "info", "success", "warning", "error"]);

export const normalizeDebugLogType = (type) => (
  LOG_TYPES.has(type) ? type : "info"
);

export const sanitizeDebugLogMessage = (message) => {
  if (typeof message !== "string") return "Diagnostic event recorded.";

  return message
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/\b(access_token|refresh_token|id_token|token|api_key|password|secret)=([^&\s]+)/gi, "$1=[redacted]")
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s+/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240) || "Diagnostic event recorded.";
};

export const createDebugLogEntry = ({
  message,
  type = "info",
  now = Date.now,
} = {}) => {
  const timestampMs = now();
  const date = new Date(timestampMs);
  const safeType = normalizeDebugLogType(type);
  const safeMessage = sanitizeDebugLogMessage(message);

  return {
    id: `${timestampMs}-${safeType}-${safeMessage.slice(0, 24)}`,
    timestampMs,
    time: date.toTimeString().split(" ")[0],
    message: safeMessage,
    type: safeType,
    count: 1,
  };
};

export const appendDebugLogEntry = (
  entries = [],
  entry,
  {
    capacity = DEBUG_EVENT_LOG_CAPACITY,
    duplicateWindowMs = DEBUG_EVENT_DUPLICATE_WINDOW_MS,
  } = {}
) => {
  const previousEntries = Array.isArray(entries) ? entries : [];
  const safeEntry = {
    ...entry,
    type: normalizeDebugLogType(entry?.type),
    message: sanitizeDebugLogMessage(entry?.message),
    count: Number.isFinite(entry?.count) ? Math.max(1, entry.count) : 1,
  };
  const latest = previousEntries[0];

  if (
    latest &&
    latest.type === safeEntry.type &&
    latest.message === safeEntry.message &&
    Number.isFinite(latest.timestampMs) &&
    safeEntry.timestampMs - latest.timestampMs <= duplicateWindowMs
  ) {
    return [
      {
        ...latest,
        id: safeEntry.id,
        timestampMs: safeEntry.timestampMs,
        time: safeEntry.time,
        count: (latest.count || 1) + 1,
      },
      ...previousEntries.slice(1, capacity),
    ];
  }

  return [safeEntry, ...previousEntries].slice(0, capacity);
};

export const appendDebugLogMessage = (entries, message, type, options = {}) => (
  appendDebugLogEntry(entries, createDebugLogEntry({ message, type, now: options.now }), options)
);

export const formatSanitizedDebugLog = (entries = []) => (
  entries
    .map((entry) => {
      const count = entry.count > 1 ? ` x${entry.count}` : "";
      return `[${entry.time || "unknown"}] ${normalizeDebugLogType(entry.type).toUpperCase()}${count}: ${sanitizeDebugLogMessage(entry.message)}`;
    })
    .join("\n")
);
