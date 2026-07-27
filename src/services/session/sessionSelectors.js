import { DEFAULT_METRIC_TREND_THRESHOLDS, EMOTION_LABELS, SESSION_STATUS } from "./sessionConstants.js";
import { calculateMetricStatistics, calculateSessionStatistics } from "./sessionStatistics.js";
import {
  formatLearningActivityLabel,
  formatStrategyLabel,
  formatSubjectLabel,
  formatTaskTypeLabel,
} from "./sessionSelfReport.js";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isProvided = (value) => (
  value !== null
  && value !== undefined
  && value !== ""
  && !(Array.isArray(value) && value.length === 0)
);
const isIntegerRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
const cleanText = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};
const timestampMs = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};
const newestTime = (session) => Math.max(timestampMs(session.endedAt), timestampMs(session.updatedAt), timestampMs(session.startedAt));
const sampleTime = (sample) => timestampMs(sample.intervalStartedAt || sample.recordedAt);
export const sortSamplesChronologically = (samples = []) => [...samples].sort((a, b) => {
  const timeDiff = sampleTime(a) - sampleTime(b);
  if (timeDiff !== 0) return timeDiff;
  return String(a.id || "").localeCompare(String(b.id || ""));
});
const meanFinite = (values = []) => {
  const numbers = values.filter(isFiniteNumber);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};
const ratingValue = (value) => (isIntegerRating(value) ? value : null);
const hasAnyProvidedValue = (values = []) => values.some(isProvided);
const compactItems = (items = []) => items.filter((item) => item && isProvided(item.value));
const analysisItem = (key, label, value, valueKind = "text") => (
  isProvided(value) ? { key, label, value, valueKind } : null
);
const subjectLabel = (session) => {
  if (session?.subject === "other") return cleanText(session.customSubject) || "Other";
  if (!session?.subject) return null;
  const label = formatSubjectLabel(session.subject);
  return label === "Not provided" ? null : label;
};
const taskTypeLabel = (session) => {
  if (session?.taskType === "other") return cleanText(session.customTaskType) || "Other";
  if (!session?.taskType) return null;
  const label = formatTaskTypeLabel(session.taskType);
  return label === "Not provided" ? null : label;
};
const selectedStrategies = (post = {}) => {
  if (!Array.isArray(post.strategiesUsed)) return [];
  return Array.from(new Set(post.strategiesUsed.filter((strategy) => (
    strategy && formatStrategyLabel(strategy) !== "Not provided"
  ))));
};
const postReflectionValues = (post = {}) => [
  post.sessionEnergy,
  post.sessionMood,
  post.perceivedFatigue,
  post.perceivedAttention,
  post.perceivedDifficulty,
  post.goalAttainment,
  post.primaryStrategy,
  post.primaryStrategyEffectiveness,
  post.primaryLearningActivity,
  post.learningReflection,
  post.nextSessionAdjustment,
  selectedStrategies(post),
];
const preSessionValues = (pre = {}) => [
  pre.expectedDifficulty,
  pre.taskConfidence,
  pre.mood,
  pre.energy,
  pre.taskValue,
];
const difficultyComparison = (expectedDifficulty, perceivedDifficulty) => {
  if (!isIntegerRating(expectedDifficulty) || !isIntegerRating(perceivedDifficulty)) return null;
  if (perceivedDifficulty < expectedDifficulty) {
    return {
      outcome: "lower",
      description: "The task felt easier than expected.",
      caution: "This difference may reflect expectation calibration, task conditions, or support received. It should not be interpreted directly as a learning gain or a change in ability.",
    };
  }
  if (perceivedDifficulty > expectedDifficulty) {
    return {
      outcome: "higher",
      description: "The task felt harder than expected.",
      caution: "This difference may reflect expectation calibration, task conditions, or support received. It should not be interpreted directly as a learning gain or a change in ability.",
    };
  }
  return {
    outcome: "equal",
    description: "The experienced difficulty was close to the initial expectation.",
    caution: "This difference may reflect expectation calibration, task conditions, or support received. It should not be interpreted directly as a learning gain or a change in ability.",
  };
};
const finiteStatisticMean = (session, key) => {
  const value = session?.statistics?.[key]?.mean;
  return isFiniteNumber(value) ? value : null;
};
const learnerObservedConstructs = Object.freeze([
  {
    key: "attention",
    label: "Attention",
    learnerLabel: "Perceived attention",
    learnerField: "perceivedAttention",
    modelLabel: "Estimated attention average",
    modelMetric: "attention",
    modelValueKind: "percentage",
    note: "The learner rating describes overall perceived attention, while the model value aggregates available attention estimates. It does not directly measure concentration, learning quality, understanding, or cognitive engagement.",
  },
  {
    key: "fatigue",
    label: "Fatigue",
    learnerLabel: "Perceived fatigue",
    learnerField: "perceivedFatigue",
    modelLabel: "Estimated fatigue average",
    modelMetric: "fatigue",
    modelValueKind: "percentage",
    note: "Subjective fatigue and model-estimated fatigue are related perspectives, but they are not equivalent clinical or physiological measurements.",
  },
  {
    key: "moodValence",
    label: "Mood / Valence",
    learnerLabel: "Overall session mood",
    learnerField: "sessionMood",
    modelLabel: "Estimated facial valence average",
    modelMetric: "valence",
    modelValueKind: "affect",
    note: "Overall mood is broader than facial valence, and facial expression may not fully represent internal emotional experience.",
  },
  {
    key: "energyArousal",
    label: "Energy / Arousal",
    learnerLabel: "Overall session energy",
    learnerField: "sessionEnergy",
    modelLabel: "Estimated facial arousal average",
    modelMetric: "arousal",
    modelValueKind: "affect",
    note: "Subjective energy and model-estimated arousal are related but different constructs. High or low arousal is not automatically positive, negative, productive, fatigued, attentive, or disengaged.",
  },
]);

/** Sort sessions newest first without mutating the input. @param {Array<Object>} sessions */
export const sortSessionsByNewest = (sessions = []) => [...sessions].sort((a, b) => {
  const timeDiff = newestTime(b) - newestTime(a);
  if (timeDiff !== 0) return timeDiff;
  return String(a.id || "").localeCompare(String(b.id || ""));
});

/** @param {Array<Object>} sessions */
export const selectLatestCompletedSession = (sessions = []) => sortSessionsByNewest(
  sessions.filter((session) => session.status === SESSION_STATUS.COMPLETED)
)[0] || null;

/** @param {Object} session */
export const selectSessionListRow = (session = {}) => ({
  id: session.id,
  dateTime: session.endedAt || session.startedAt || session.createdAt || null,
  taskDescription: session.taskDescription || "",
  targetDurationMs: session.targetDurationMs ?? null,
  actualDurationMs: session.actualDurationMs ?? null,
  dataCoverage: session.dataCoverage ?? null,
  subject: session.subject ?? null,
  customSubject: session.customSubject ?? null,
  taskType: session.taskType ?? null,
  customTaskType: session.customTaskType ?? null,
});

/** @param {Array<Object>} samples */
export const selectBehavioralTimeline = (samples = []) => sortSamplesChronologically(samples).map((sample) => ({
  id: sample.id,
  elapsedMs: sample.elapsedMs,
  attention: isFiniteNumber(sample.attention) ? sample.attention : null,
  fatigue: isFiniteNumber(sample.fatigue) ? sample.fatigue : null,
  dataQuality: sample.dataQuality,
}));

/** @param {Array<Object>} samples */
export const selectEmotionalTrajectory = (samples = []) => sortSamplesChronologically(samples)
  .filter((sample) => isFiniteNumber(sample.valence) && isFiniteNumber(sample.arousal))
  .map((sample) => ({
    id: sample.id,
    elapsedMs: sample.elapsedMs,
    valence: sample.valence,
    arousal: sample.arousal,
    emotion: sample.emotion ?? null,
    emotionConfidence: isFiniteNumber(sample.emotionConfidence) ? sample.emotionConfidence : null,
    dataQuality: sample.dataQuality,
  }));

/** Count valid classified affect intervals by stored top-1 expression. @param {Array<Object>} samples */
export const selectExpressionIntervalDistribution = (samples = []) => {
  const counts = new Map(EMOTION_LABELS.map((label) => [label, 0]));
  let total = 0;

  sortSamplesChronologically(samples).forEach((sample) => {
    if (!isFiniteNumber(sample.valence) || !isFiniteNumber(sample.arousal)) return;
    if (!sample.emotion || !counts.has(sample.emotion)) return;
    counts.set(sample.emotion, counts.get(sample.emotion) + 1);
    total += 1;
  });

  return {
    total,
    items: EMOTION_LABELS.map((label) => {
      const count = counts.get(label) || 0;
      return {
        label,
        count,
        percentage: total > 0 ? count / total : 0,
      };
    }),
  };
};

/** @param {Array<Object>} samples */
export const selectMetricAverages = (samples = []) => ({
  attention: meanFinite(samples.map((sample) => sample.attention)),
  fatigue: meanFinite(samples.map((sample) => sample.fatigue)),
  valence: meanFinite(samples.map((sample) => sample.valence)),
  arousal: meanFinite(samples.map((sample) => sample.arousal)),
});

/** Return samples only when they all belong to the requested session. @param {Array<Object>} samples @param {string|null} sessionId */
export const selectSessionScopedMetricSamples = (samples = [], sessionId = null) => {
  if (!sessionId) return [];
  const rows = Array.isArray(samples) ? samples : [];
  if (rows.length === 0) return [];
  return rows.every((sample) => sample?.sessionId === sessionId) ? rows : [];
};

/** @param {Array<Object>} samples */
export const selectEmotionalMeanPoint = (samples = []) => {
  const trajectory = selectEmotionalTrajectory(samples);
  const valence = meanFinite(trajectory.map((point) => point.valence));
  const arousal = meanFinite(trajectory.map((point) => point.arousal));
  if (!isFiniteNumber(valence) || !isFiniteNumber(arousal)) return null;
  return { valence, arousal };
};

const metricDefinitions = Object.freeze([
  { id: "attention", label: "Attention", rangeLabel: "0-100", valueKind: "percentage" },
  { id: "fatigue", label: "Fatigue", rangeLabel: "0-100", valueKind: "percentage" },
  { id: "valence", label: "Valence", rangeLabel: "-1 to 1", valueKind: "affect" },
  { id: "arousal", label: "Arousal", rangeLabel: "-1 to 1", valueKind: "affect" },
]);

const getStatistics = (session, samples) => session?.statistics || calculateSessionStatistics(samples, session || {});

/** Select the main dashboard source without conflating it with historical modal selection. @param {Object} input */
export const selectDashboardSessionSource = ({ activeSession = null, completedSessions = [] } = {}) => {
  if (activeSession?.status === SESSION_STATUS.ACTIVE) {
    return {
      kind: "active",
      label: "Live Current Session",
      session: activeSession,
      isCurrentSession: true,
      isActive: true,
      isPaused: false,
    };
  }

  if (activeSession?.status === SESSION_STATUS.PAUSED) {
    return {
      kind: "paused",
      label: "Paused Current Session",
      session: activeSession,
      isCurrentSession: true,
      isActive: false,
      isPaused: true,
    };
  }

  const latestCompleted = selectLatestCompletedSession(completedSessions);
  if (latestCompleted) {
    return {
      kind: "latest-completed",
      label: "Latest Completed Session",
      session: latestCompleted,
      isCurrentSession: false,
      isActive: false,
      isPaused: false,
    };
  }

  return {
    kind: "empty",
    label: "No Session Data",
    session: null,
    isCurrentSession: false,
    isActive: false,
    isPaused: false,
  };
};

export const selectSessionContext = (session = null) => {
  if (!session) return [];
  return [
    ["Task Name", session.taskName || session.taskDescription || null],
    ["Target Duration", session.targetDurationMs ?? null],
    ["Actual Duration", session.actualDurationMs ?? session.accumulatedStudyMs ?? null],
    ["Subject", session.subject === "other" ? session.customSubject : formatSubjectLabel(session.subject)],
    ["Task Type", session.taskType === "other" ? session.customTaskType : formatTaskTypeLabel(session.taskType)],
    ["Session Goal", session.sessionGoal ?? null],
  ];
};

/** Build a single-session self-report analysis view model without comparing it to model-observed metrics. @param {Object|null} session */
export const selectSessionSelfReportAnalysis = (session = null) => {
  if (!session) return null;

  const pre = session.preSessionCheckIn || {};
  const post = session.postSessionCheckOut || {};
  const isCompleted = session.status === SESSION_STATUS.COMPLETED;
  const strategies = selectedStrategies(post);
  const primaryStrategy = post.primaryStrategy && post.primaryStrategy !== "none_or_unsure"
    ? post.primaryStrategy
    : null;
  const otherStrategies = strategies.filter((strategy) => (
    strategy !== "none_or_unsure" && strategy !== primaryStrategy
  ));
  const selectedNoneOrUnsure = strategies.includes("none_or_unsure");
  const expectedDifficulty = ratingValue(pre.expectedDifficulty);
  const perceivedDifficulty = ratingValue(post.perceivedDifficulty);
  const initialMood = ratingValue(pre.mood);
  const sessionMood = ratingValue(post.sessionMood);
  const initialEnergy = ratingValue(pre.energy);
  const sessionEnergy = ratingValue(post.sessionEnergy);
  const initialConfidence = ratingValue(pre.taskConfidence);
  const goalAttainment = ratingValue(post.goalAttainment);
  const hasPreSessionData = hasAnyProvidedValue(preSessionValues(pre));
  const hasPostSessionReflection = hasAnyProvidedValue(postReflectionValues(post));

  const goalContextItems = compactItems([
    analysisItem("taskName", "Task name", cleanText(session.taskName || session.taskDescription)),
    analysisItem("subject", "Subject", subjectLabel(session)),
    analysisItem("taskType", "Task type", taskTypeLabel(session)),
    analysisItem("sessionGoal", "Session goal", cleanText(session.sessionGoal), "longText"),
    analysisItem("targetDurationMs", "Target duration", session.targetDurationMs, "targetDuration"),
    analysisItem(
      "actualDurationMs",
      isCompleted ? "Actual duration" : "Elapsed duration",
      session.actualDurationMs ?? session.accumulatedStudyMs,
      "duration"
    ),
  ]);
  const goalOutcomeItems = isCompleted ? compactItems([
    analysisItem("goalAttainment", "Goal attainment - learner-reported", goalAttainment, "rating"),
  ]) : [];
  const initialCheckInItems = compactItems([
    analysisItem("expectedDifficulty", "Expected difficulty", expectedDifficulty, "rating"),
    analysisItem("taskConfidence", "Initial task confidence", initialConfidence, "rating"),
    analysisItem("mood", "Initial mood", initialMood, "rating"),
    analysisItem("energy", "Initial energy", initialEnergy, "rating"),
    analysisItem("taskValue", "Task value", ratingValue(pre.taskValue), "rating"),
  ]);

  const expectationExperience = isCompleted ? {
    available: hasAnyProvidedValue([
      expectedDifficulty,
      perceivedDifficulty,
      initialMood,
      sessionMood,
      initialEnergy,
      sessionEnergy,
      initialConfidence,
      goalAttainment,
    ]),
    difficulty: {
      expected: expectedDifficulty,
      perceived: perceivedDifficulty,
      comparison: difficultyComparison(expectedDifficulty, perceivedDifficulty),
    },
    mood: {
      beforeSession: initialMood,
      overallSessionExperience: sessionMood,
    },
    energy: {
      beforeSession: initialEnergy,
      overallSessionExperience: sessionEnergy,
    },
    confidenceGoal: {
      initialConfidence,
      goalAttainment,
      context: isIntegerRating(initialConfidence) && isIntegerRating(goalAttainment)
        ? "Initial confidence and learner-reported goal attainment describe different constructs within this individual session. Their relationship cannot establish stable overconfidence, underconfidence, or confidence improvement; identifying a stable pattern requires multiple comparable sessions."
        : null,
    },
  } : {
    available: false,
    difficulty: { expected: expectedDifficulty, perceived: null, comparison: null },
    mood: { beforeSession: initialMood, overallSessionExperience: null },
    energy: { beforeSession: initialEnergy, overallSessionExperience: null },
    confidenceGoal: { initialConfidence, goalAttainment: null, context: null },
  };

  const motivationalContextItems = compactItems([
    analysisItem("taskValue", "Task value", ratingValue(pre.taskValue), "rating"),
    analysisItem("expectedDifficulty", "Expected difficulty", expectedDifficulty, "rating"),
    analysisItem("taskConfidence", "Initial task confidence", initialConfidence, "rating"),
  ]);

  const learningStrategyItems = isCompleted ? compactItems([
    analysisItem("primaryStrategy", "Primary strategy", primaryStrategy, "strategy"),
    analysisItem("primaryStrategyEffectiveness", "Primary strategy effectiveness", primaryStrategy ? ratingValue(post.primaryStrategyEffectiveness) : null, "rating"),
    analysisItem("otherStrategies", "Other strategies used", otherStrategies, "strategyList"),
    analysisItem("primaryLearningActivity", "Reported primary learning activity", post.primaryLearningActivity, "learningActivity"),
    analysisItem("learningReflection", "Learning reflection", cleanText(post.learningReflection), "longText"),
    analysisItem("nextSessionAdjustment", "Next-session adjustment", cleanText(post.nextSessionAdjustment), "longText"),
  ]) : [];

  return {
    isCompleted,
    hasPreSessionData,
    hasPostSessionReflection,
    goalOutcome: {
      contextItems: goalContextItems,
      outcomeItems: goalOutcomeItems,
      postUnavailableMessage: isCompleted && !hasPostSessionReflection
        ? "Post-session reflection was not completed, so learner-reported outcome details are unavailable."
        : null,
      currentSessionMessage: !isCompleted
        ? "Post-session outcome and reflection details become available after the session is completed."
        : null,
    },
    initialCheckIn: {
      available: hasPreSessionData,
      items: initialCheckInItems,
      unavailableMessage: "Initial check-in responses are unavailable for this session.",
    },
    expectationExperience,
    motivationalContext: {
      available: motivationalContextItems.length > 0,
      items: motivationalContextItems,
      context: "These initial appraisals provide context for interpreting the session experience, but they do not determine the cause of the learner's emotions or performance.",
    },
    learningStrategy: {
      available: learningStrategyItems.length > 0 || selectedNoneOrUnsure,
      primaryStrategy,
      otherStrategies,
      selectedNoneOrUnsure,
      items: learningStrategyItems,
      note: selectedNoneOrUnsure
        ? "The learner selected None / Not sure for strategies used; no negative judgment is inferred from that response."
        : null,
    },
  };
};

/** Build a descriptive learner-report vs model-observed signal comparison for one completed session. @param {Object|null} session */
export const selectLearnerObservedSignalComparison = (session = null) => {
  if (!session || session.status !== SESSION_STATUS.COMPLETED) {
    return {
      available: false,
      eligibility: "completed-session-required",
      rows: [],
      dataCoverage: null,
      note: "Learner report vs model observation is available only after a session is completed.",
    };
  }

  const post = session.postSessionCheckOut || {};
  const rows = learnerObservedConstructs
    .map((construct) => {
      const learnerValue = ratingValue(post[construct.learnerField]);
      if (!isIntegerRating(learnerValue)) return null;

      const modelValue = finiteStatisticMean(session, construct.modelMetric);
      const hasModelValue = isFiniteNumber(modelValue);
      return {
        key: construct.key,
        label: construct.label,
        learner: {
          label: construct.learnerLabel,
          value: learnerValue,
          valueKind: "rating",
          scaleLabel: "1-5 learner rating",
        },
        model: {
          label: construct.modelLabel,
          value: hasModelValue ? modelValue : null,
          valueKind: construct.modelValueKind,
          scaleLabel: construct.modelValueKind === "percentage" ? "0-100 estimated signal" : "-1 to 1 estimated signal",
          unavailableMessage: hasModelValue ? null : "The corresponding model-estimated signal is unavailable for this session.",
        },
        availability: hasModelValue ? "paired" : "learner-only",
        note: construct.note,
      };
    })
    .filter(Boolean);

  return {
    available: rows.length > 0,
    eligibility: "completed-session",
    rows,
    dataCoverage: isFiniteNumber(session.dataCoverage) ? session.dataCoverage : null,
    note: rows.length > 0
      ? "Two complementary views of the same Session, measured with different methods and scales. Side-by-side values do not determine which source is correct."
      : "No learner-reported session experience ratings are available for comparison.",
  };
};

export const selectPreSessionCheckIn = (session = null) => session?.preSessionCheckIn || null;
export const selectPostSessionCheckOut = (session = null) => session?.postSessionCheckOut || null;
export const selectReportedICAPMode = (session = null) => {
  const activity = session?.postSessionCheckOut?.primaryLearningActivity || null;
  return activity ? formatLearningActivityLabel(activity) : null;
};
export const selectFormattedStrategies = (session = null) => {
  const strategies = session?.postSessionCheckOut?.strategiesUsed || [];
  return strategies.map(formatStrategyLabel);
};

/** Return dashboard metric card models without exposing repository or statistics details to components. @param {Object} input */
export const selectDashboardMetricCards = ({ session = null, samples = [], currentMetrics = null, isActive = false } = {}) => {
  if (!session) {
    return metricDefinitions.map((definition) => ({
      ...definition,
      currentValue: null,
      averageValue: null,
      trend: "insufficient",
      status: "No session data",
      dataQuality: null,
    }));
  }
  
  const chronologicalSamples = sortSamplesChronologically(samples);
  const latest = chronologicalSamples[chronologicalSamples.length - 1] || {};
  const statistics = getStatistics(session, chronologicalSamples);

  return metricDefinitions.map((definition) => {
    const metricStats = statistics?.[definition.id] || calculateMetricStatistics(
      chronologicalSamples.map((row) => row[definition.id]),
      { meaningfulTrendChange: DEFAULT_METRIC_TREND_THRESHOLDS[definition.id] }
    );
    const currentValue = isActive
      ? currentMetrics?.[definition.id] ?? latest[definition.id] ?? null
      : latest[definition.id] ?? metricStats.mean ?? null;

    return {
      ...definition,
      currentValue,
      averageValue: metricStats.mean ?? null,
      trend: metricStats.trend || "insufficient",
      status: metricStats.validCount > 0 ? metricStats.trend || "available" : "Unavailable",
      dataQuality: latest.dataQuality ?? null,
    };
  });
};

/** Return structured summary sections in a stable render order. @param {Object|null} session */
export const selectSessionSummarySections = (session = null) => {
  const summary = session?.summary;
  if (!summary) return [];
  return [
    ["behavioralEngagement", "Behavioral Engagement"],
    ["fatiguePattern", "Fatigue Pattern"],
    ["emotionalEngagement", "Emotional Engagement"],
    ["dataReliability", "Data Reliability"],
    ["overallStatus", "Overall Status"],
  ]
    .map(([key, fallbackTitle]) => ({ key, fallbackTitle, section: summary[key] }))
    .filter((item) => item.section);
};

/** Build newest-first rows for the future Session History table. @param {Array<Object>} sessions */
export const selectSessionHistoryRows = (sessions = []) => sortSessionsByNewest(sessions).map(selectSessionListRow);

/** @param {Array<Object>} sessions @param {{start?:string|Date,end?:string|Date}} range */
export const selectSessionsWithinRange = (sessions = [], range = {}) => {
  const start = range.start ? timestampMs(range.start) : Number.NEGATIVE_INFINITY;
  const end = range.end ? timestampMs(range.end) : Number.POSITIVE_INFINITY;
  return sortSessionsByNewest(sessions.filter((session) => {
    const time = newestTime(session);
    return time >= start && time <= end;
  }));
};
