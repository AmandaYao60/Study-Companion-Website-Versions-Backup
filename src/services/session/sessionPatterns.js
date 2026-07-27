import { SESSION_STATUS } from "./sessionConstants.js";
import {
  formatStrategyLabel,
  formatSubjectLabel,
  formatTaskTypeLabel,
} from "./sessionSelfReport.js";

export const LONG_TERM_PATTERN_MINIMUM_SESSIONS = 3;
export const LONG_TERM_PATTERN_MINIMUM_VALUES = 3;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const cleanText = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};
const timestampMs = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
};
const isRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
const validDuration = (value) => (isFiniteNumber(value) && value >= 0 ? value : null);
const median = (values = []) => {
  const numbers = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (numbers.length === 0) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 === 1 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
};
const mean = (values = []) => {
  const numbers = values.filter(isFiniteNumber);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};
const sessionSortKey = (session) => timestampMs(session?.startedAt) ?? Number.POSITIVE_INFINITY;
const stableSessionId = (session, index) => cleanText(session?.id) || `session-${index}`;
const hasValidCoverage = (value) => isFiniteNumber(value) && value >= 0 && value <= 1;
const selectCoverage = (session) => {
  if (hasValidCoverage(session?.dataCoverage)) return session.dataCoverage;
  if (hasValidCoverage(session?.statistics?.dataCoverage)) return session.statistics.dataCoverage;
  return null;
};
const modelMean = (session, key) => {
  const value = session?.statistics?.[key]?.mean;
  return isFiniteNumber(value) ? value : null;
};
const hasAnyFiniteModelMean = (session) => (
  ["attention", "fatigue", "stress", "valence", "arousal"].some((key) => isFiniteNumber(modelMean(session, key)))
);
const dateLabel = (timestamp) => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const subjectBreakdownValue = (session) => {
  if (session?.subject === "other") return cleanText(session.customSubject)
    ? { key: `custom:${cleanText(session.customSubject)}`, label: cleanText(session.customSubject) }
    : { key: "other", label: "Other" };
  if (!session?.subject) return { key: "not-recorded", label: "Not recorded" };
  const label = formatSubjectLabel(session.subject);
  return label === "Not provided" ? { key: "not-recorded", label: "Not recorded" } : { key: session.subject, label };
};

const taskTypeBreakdownValue = (session) => {
  if (session?.taskType === "other") return cleanText(session.customTaskType)
    ? { key: `custom:${cleanText(session.customTaskType)}`, label: cleanText(session.customTaskType) }
    : { key: "other", label: "Other" };
  if (!session?.taskType) return { key: "not-recorded", label: "Not recorded" };
  const label = formatTaskTypeLabel(session.taskType);
  return label === "Not provided" ? { key: "not-recorded", label: "Not recorded" } : { key: session.taskType, label };
};

export const classifySessionDaypart = (startedAt) => {
  const timestamp = timestampMs(startedAt);
  if (timestamp === null) return null;
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour <= 11) return { key: "morning", label: "Morning" };
  if (hour >= 12 && hour <= 16) return { key: "afternoon", label: "Afternoon" };
  if (hour >= 17 && hour <= 21) return { key: "evening", label: "Evening" };
  return { key: "night", label: "Night" };
};

const primaryStrategyBreakdownValue = (session) => {
  const post = session?.postSessionCheckOut || {};
  if (post.primaryStrategy) {
    const label = formatStrategyLabel(post.primaryStrategy);
    return label === "Not provided" ? { key: "not-recorded", label: "Not recorded" } : { key: post.primaryStrategy, label };
  }
  if (Array.isArray(post.strategiesUsed) && post.strategiesUsed.includes("none_or_unsure")) {
    return { key: "none_or_unsure", label: "None / Not sure" };
  }
  return { key: "not-recorded", label: "Not recorded" };
};

const createBreakdown = (sessions, selectValue) => {
  const rowsByKey = new Map();
  sessions.forEach((session) => {
    const value = selectValue(session);
    if (!value) return;
    const duration = validDuration(session.actualDurationMs);
    const existing = rowsByKey.get(value.key) || {
      key: value.key,
      label: value.label,
      sessionCount: 0,
      totalRecordedDuration: 0,
      durationSessionCount: 0,
    };
    existing.sessionCount += 1;
    if (duration !== null) {
      existing.totalRecordedDuration += duration;
      existing.durationSessionCount += 1;
    }
    rowsByKey.set(value.key, existing);
  });

  const rows = Array.from(rowsByKey.values())
    .map((row) => ({
      ...row,
      totalRecordedDuration: row.durationSessionCount > 0 ? row.totalRecordedDuration : null,
    }))
    .sort((a, b) => {
      if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
      return a.label.localeCompare(b.label);
    });
  const highestCount = rows[0]?.sessionCount || 0;
  const tiedHighest = rows.filter((row) => row.sessionCount === highestCount);
  const mostFrequent = highestCount >= LONG_TERM_PATTERN_MINIMUM_SESSIONS && tiedHighest.length === 1
    ? { key: tiedHighest[0].key, label: tiedHighest[0].label, sessionCount: tiedHighest[0].sessionCount }
    : null;

  return {
    rows,
    contributingSessionCount: rows.reduce((sum, row) => sum + row.sessionCount, 0),
    mostFrequent,
  };
};

const learnerMetricDefinitions = Object.freeze([
  { key: "goalAttainment", label: "Goal attainment", source: "postSessionCheckOut", field: "goalAttainment" },
  { key: "perceivedDifficulty", label: "Perceived difficulty", source: "postSessionCheckOut", field: "perceivedDifficulty" },
  { key: "perceivedAttention", label: "Perceived attention", source: "postSessionCheckOut", field: "perceivedAttention" },
  { key: "perceivedFatigue", label: "Perceived fatigue", source: "postSessionCheckOut", field: "perceivedFatigue" },
  { key: "sessionMood", label: "Overall session mood", source: "postSessionCheckOut", field: "sessionMood" },
  { key: "sessionEnergy", label: "Overall session energy", source: "postSessionCheckOut", field: "sessionEnergy" },
  { key: "taskConfidence", label: "Initial task confidence", source: "preSessionCheckIn", field: "taskConfidence" },
  { key: "primaryStrategyEffectiveness", label: "Primary strategy effectiveness", source: "postSessionCheckOut", field: "primaryStrategyEffectiveness" },
]);

const modelMetricDefinitions = Object.freeze([
  { key: "attention", label: "Estimated attention", valueKind: "percentage", scaleLabel: "0-100 estimated signal" },
  { key: "fatigue", label: "Estimated fatigue", valueKind: "percentage", scaleLabel: "0-100 estimated signal" },
  { key: "stress", label: "Estimated stress", valueKind: "percentage", scaleLabel: "0-100 estimated signal" },
  { key: "valence", label: "Estimated facial valence", valueKind: "affect", scaleLabel: "-1 to 1 estimated signal" },
  { key: "arousal", label: "Estimated facial arousal", valueKind: "affect", scaleLabel: "-1 to 1 estimated signal" },
]);

const buildLearnerReportedHistory = (sessions) => {
  const allMetrics = learnerMetricDefinitions.map((definition) => {
    const values = [];
    const series = [];
    sessions.forEach((session, index) => {
      const value = session?.[definition.source]?.[definition.field];
      if (!isRating(value)) return;
      const startedMs = timestampMs(session.startedAt);
      values.push(value);
      if (startedMs !== null) {
        series.push({
          sessionId: stableSessionId(session, index),
          startedAt: session.startedAt,
          timestamp: startedMs,
          dateLabel: dateLabel(startedMs),
          value,
          source: "Learner report",
        });
      }
    });
    return {
      key: definition.key,
      label: definition.label,
      source: "Learner report",
      scaleLabel: "1-5 learner rating",
      medianRating: values.length >= LONG_TERM_PATTERN_MINIMUM_VALUES ? median(values) : null,
      responseCount: values.length,
      minimumResponseCount: LONG_TERM_PATTERN_MINIMUM_VALUES,
      series: values.length >= LONG_TERM_PATTERN_MINIMUM_VALUES ? series.sort((a, b) => a.timestamp - b.timestamp) : [],
      available: values.length >= LONG_TERM_PATTERN_MINIMUM_VALUES,
    };
  });

  return {
    metrics: allMetrics.filter((metric) => metric.available),
    unavailableMetrics: allMetrics.filter((metric) => !metric.available).map((metric) => ({
      key: metric.key,
      label: metric.label,
      responseCount: metric.responseCount,
      minimumResponseCount: metric.minimumResponseCount,
    })),
    series: Object.fromEntries(allMetrics.filter((metric) => metric.available).map((metric) => [metric.key, metric.series])),
    availableMetricKeys: allMetrics.filter((metric) => metric.available).map((metric) => metric.key),
  };
};

const buildModelObservedHistory = (sessions) => {
  const coverageSessionIds = new Set();
  const zeroCoverageSessionIds = new Set();
  let knownCoverageCount = 0;
  let unknownCoverageCount = 0;

  const allMetrics = modelMetricDefinitions.map((definition) => {
    const values = [];
    const series = [];
    sessions.forEach((session, index) => {
      const value = modelMean(session, definition.key);
      if (!isFiniteNumber(value)) return;
      const coverage = selectCoverage(session);
      const sessionId = stableSessionId(session, index);
      if (coverage === 0) {
        zeroCoverageSessionIds.add(sessionId);
        return;
      }
      if (!coverageSessionIds.has(sessionId)) {
        coverageSessionIds.add(sessionId);
        if (coverage === null) unknownCoverageCount += 1;
        else knownCoverageCount += 1;
      }
      values.push(value);
      const startedMs = timestampMs(session.startedAt);
      if (startedMs !== null) {
        series.push({
          sessionId,
          startedAt: session.startedAt,
          timestamp: startedMs,
          dateLabel: dateLabel(startedMs),
          value,
          source: "Model observation",
          dataCoverage: coverage,
        });
      }
    });
    return {
      key: definition.key,
      label: definition.label,
      source: "Model observation",
      valueKind: definition.valueKind,
      scaleLabel: definition.scaleLabel,
      meanValue: values.length >= LONG_TERM_PATTERN_MINIMUM_VALUES ? mean(values) : null,
      sessionCount: values.length,
      minimumSessionCount: LONG_TERM_PATTERN_MINIMUM_VALUES,
      series: values.length >= LONG_TERM_PATTERN_MINIMUM_VALUES ? series.sort((a, b) => a.timestamp - b.timestamp) : [],
      available: values.length >= LONG_TERM_PATTERN_MINIMUM_VALUES,
    };
  });

  return {
    metrics: allMetrics.filter((metric) => metric.available),
    unavailableMetrics: allMetrics.filter((metric) => !metric.available).map((metric) => ({
      key: metric.key,
      label: metric.label,
      sessionCount: metric.sessionCount,
      minimumSessionCount: metric.minimumSessionCount,
    })),
    series: Object.fromEntries(allMetrics.filter((metric) => metric.available).map((metric) => [metric.key, metric.series])),
    availableMetricKeys: allMetrics.filter((metric) => metric.available).map((metric) => metric.key),
    coverage: {
      knownCount: knownCoverageCount,
      unknownCount: unknownCoverageCount,
      zeroCoverageCount: zeroCoverageSessionIds.size,
      contributingSessionCount: coverageSessionIds.size,
      limitation: unknownCoverageCount > 0 || zeroCoverageSessionIds.size > 0
        ? "Model-data coverage is descriptive context. Sessions with zero coverage do not contribute model-observation metric values, and unknown coverage is reported separately."
        : null,
    },
  };
};

/** Build a deterministic descriptive history view from completed session records. @param {Array<Object>} sessions */
export const selectLongTermSessionPatterns = (sessions = []) => {
  const input = Array.isArray(sessions) ? sessions : [];
  const completedSessions = input
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session?.status === SESSION_STATUS.COMPLETED)
    .sort((a, b) => {
      const timeDiff = sessionSortKey(a.session) - sessionSortKey(b.session);
      if (timeDiff !== 0) return timeDiff;
      return stableSessionId(a.session, a.index).localeCompare(stableSessionId(b.session, b.index));
    })
    .map(({ session }) => session);

  const completedSessionCount = completedSessions.length;
  const durations = completedSessions.map((session) => validDuration(session.actualDurationMs)).filter((value) => value !== null);
  const validTimestampSessions = completedSessions
    .map((session, index) => ({ session, index, timestamp: timestampMs(session.startedAt) }))
    .filter((item) => item.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
  const learnerReported = buildLearnerReportedHistory(completedSessions);
  const modelObserved = buildModelObservedHistory(completedSessions);
  const limitations = [];

  if (completedSessionCount === 0) {
    limitations.push("No completed Sessions are available yet.");
  } else if (completedSessionCount < LONG_TERM_PATTERN_MINIMUM_SESSIONS) {
    limitations.push(`Long-term Patterns need at least ${LONG_TERM_PATTERN_MINIMUM_SESSIONS} completed Sessions before describing longitudinal patterns.`);
  }
  if (durations.length < completedSessionCount) {
    limitations.push(`${completedSessionCount - durations.length} completed Session${completedSessionCount - durations.length === 1 ? "" : "s"} did not include a valid recorded duration.`);
  }
  if (validTimestampSessions.length < completedSessionCount) {
    limitations.push(`${completedSessionCount - validTimestampSessions.length} completed Session${completedSessionCount - validTimestampSessions.length === 1 ? "" : "s"} did not include a valid start timestamp.`);
  }
  if (learnerReported.availableMetricKeys.length === 0 && completedSessionCount >= LONG_TERM_PATTERN_MINIMUM_SESSIONS) {
    limitations.push(`No learner-report metric has ${LONG_TERM_PATTERN_MINIMUM_VALUES} valid responses yet.`);
  }
  if (modelObserved.availableMetricKeys.length === 0 && completedSessionCount >= LONG_TERM_PATTERN_MINIMUM_SESSIONS) {
    limitations.push(`No model-observation metric has ${LONG_TERM_PATTERN_MINIMUM_VALUES} valid completed Sessions with usable statistics yet.`);
  }
  if (modelObserved.coverage.limitation) limitations.push(modelObserved.coverage.limitation);

  return {
    status: completedSessionCount === 0
      ? "empty"
      : completedSessionCount < LONG_TERM_PATTERN_MINIMUM_SESSIONS
        ? "building"
        : "available",
    eligibility: {
      completedSessionCount,
      minimumSessionCount: LONG_TERM_PATTERN_MINIMUM_SESSIONS,
    },
    overview: {
      totalStudyDuration: durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) : null,
      medianSessionDuration: durations.length > 0 ? median(durations) : null,
      dateRange: validTimestampSessions.length > 0
        ? {
          start: validTimestampSessions[0].session.startedAt,
          end: validTimestampSessions[validTimestampSessions.length - 1].session.startedAt,
          sessionCount: validTimestampSessions.length,
        }
        : null,
      sessionsWithValidDuration: durations.length,
    },
    contextBreakdowns: {
      subjects: createBreakdown(completedSessions, subjectBreakdownValue),
      taskTypes: createBreakdown(completedSessions, taskTypeBreakdownValue),
      dayparts: createBreakdown(completedSessions, (session) => classifySessionDaypart(session.startedAt)),
      primaryStrategies: createBreakdown(completedSessions, primaryStrategyBreakdownValue),
    },
    learnerReported,
    modelObserved,
    limitations,
  };
};
