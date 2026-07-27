import {
  DEFAULT_MINIMUM_DATA_COVERAGE,
  SESSION_SUMMARY_ALGORITHM_VERSION,
  SUMMARY_CONFIDENCE,
} from "./sessionConstants.js";
import {
  formatLearningActivityLabel,
  formatStrategyLabel,
  formatSubjectLabel,
  formatTaskTypeLabel,
} from "./sessionSelfReport.js";

export const DEFAULT_SESSION_SUMMARY_THRESHOLDS = Object.freeze({
  minimumCoverage: DEFAULT_MINIMUM_DATA_COVERAGE,
  strongCoverage: 0.8,
  highAttention: 70,
  lowAttention: 45,
  highFatigue: 65,
  meaningfulTrendChange: 15,
  neutralValenceBand: 0.2,
  highArousal: 0.5,
  lowArousal: -0.3,
});

export const SUMMARY_EVIDENCE_TYPE = Object.freeze({
  SESSION_RECORD: "session-record",
  LEARNER_REPORT: "learner-report",
  MODEL_OBSERVATION: "model-observation",
  CAUTIOUS_INTERPRETATION: "cautious-interpretation",
  DATA_LIMITATION: "data-limitation",
});

// Preliminary product rules only. These thresholds are not scientifically validated and should be revised after professional literature review.
const mergeThresholds = (thresholds = {}) => ({ ...DEFAULT_SESSION_SUMMARY_THRESHOLDS, ...thresholds });
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
const cleanText = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};
const ratingText = (value) => (isRating(value) ? `${value}/5` : null);
const metricMean = (statistics, key) => {
  const value = statistics?.[key]?.mean;
  return isFiniteNumber(value) ? value : null;
};
const hasFiniteModelStatistic = (statistics) => (
  ["attention", "fatigue", "valence", "arousal"].some((key) => isFiniteNumber(metricMean(statistics, key)))
);
const formatMetric = (value, valueKind = "percentage") => {
  if (!isFiniteNumber(value)) return null;
  if (valueKind === "affect") return value.toFixed(2);
  return `${Math.round(value)}%`;
};
const formatCoverage = (coverage) => (isFiniteNumber(coverage) ? `${Math.round(coverage * 100)}%` : null);
const formatDuration = (milliseconds) => {
  if (!isFiniteNumber(milliseconds) || milliseconds <= 0) return null;
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
const subjectLabel = (session = {}) => {
  if (session.subject === "other") return cleanText(session.customSubject) || "Other";
  if (!session.subject) return null;
  const label = formatSubjectLabel(session.subject);
  return label === "Not provided" ? null : label;
};
const taskTypeLabel = (session = {}) => {
  if (session.taskType === "other") return cleanText(session.customTaskType) || "Other";
  if (!session.taskType) return null;
  const label = formatTaskTypeLabel(session.taskType);
  return label === "Not provided" ? null : label;
};
const selectedStrategies = (post = {}) => {
  if (!Array.isArray(post.strategiesUsed)) return [];
  return Array.from(new Set(post.strategiesUsed.filter((strategy) => (
    strategy && formatStrategyLabel(strategy) !== "Not provided"
  ))));
};
const evidence = (type, label, message) => ({ type, label, message });
const section = (label, title, message, confidence, evidenceItems = []) => ({
  label,
  title,
  message,
  confidence,
  evidence: evidenceItems,
});
const hasEvidence = (items = []) => items.length > 0;

const buildGoalOutcomeSection = (session, post) => {
  const items = [];
  const taskName = cleanText(session?.taskName || session?.taskDescription);
  const subject = subjectLabel(session);
  const taskType = taskTypeLabel(session);
  const sessionGoal = cleanText(session?.sessionGoal);
  const targetDuration = formatDuration(session?.targetDurationMs);
  const actualDuration = formatDuration(session?.actualDurationMs ?? session?.accumulatedStudyMs);
  const goalAttainment = ratingText(post.goalAttainment);

  if (taskName) items.push(evidence(SUMMARY_EVIDENCE_TYPE.SESSION_RECORD, "Task name", `The Session record lists the task as "${taskName}".`));
  if (subject) items.push(evidence(SUMMARY_EVIDENCE_TYPE.SESSION_RECORD, "Subject", `The Session record lists the subject as ${subject}.`));
  if (taskType) items.push(evidence(SUMMARY_EVIDENCE_TYPE.SESSION_RECORD, "Task type", `The Session record lists the task type as ${taskType}.`));
  if (sessionGoal) items.push(evidence(SUMMARY_EVIDENCE_TYPE.SESSION_RECORD, "Session goal", `The Session goal was "${sessionGoal}".`));
  if (targetDuration) items.push(evidence(SUMMARY_EVIDENCE_TYPE.SESSION_RECORD, "Target duration", `The target duration was ${targetDuration}.`));
  if (actualDuration) items.push(evidence(SUMMARY_EVIDENCE_TYPE.SESSION_RECORD, "Actual duration", `The recorded duration was ${actualDuration}.`));
  if (goalAttainment) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Goal attainment", `The learner reported goal attainment as ${goalAttainment}.`));

  if (!hasEvidence(items)) return null;
  return section(
    "goal-outcome",
    "Goal & Outcome",
    "Session metadata and learner-reported outcome are summarized without treating duration or goal attainment as a performance score.",
    SUMMARY_CONFIDENCE.MODERATE,
    items
  );
};

const buildExperienceSection = (pre, post, { includeLimitations = false } = {}) => {
  const items = [];
  const expectedDifficulty = ratingText(pre.expectedDifficulty);
  const perceivedDifficulty = ratingText(post.perceivedDifficulty);
  const perceivedAttention = ratingText(post.perceivedAttention);
  const perceivedFatigue = ratingText(post.perceivedFatigue);
  const sessionMood = ratingText(post.sessionMood);
  const sessionEnergy = ratingText(post.sessionEnergy);
  const taskConfidence = ratingText(pre.taskConfidence);
  const taskValue = ratingText(pre.taskValue);

  if (expectedDifficulty) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Expected difficulty", `The learner rated expected difficulty as ${expectedDifficulty}.`));
  if (perceivedDifficulty) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Perceived difficulty", `The learner rated perceived difficulty as ${perceivedDifficulty}.`));
  if (isRating(pre.expectedDifficulty) && isRating(post.perceivedDifficulty)) {
    const description = post.perceivedDifficulty < pre.expectedDifficulty
      ? "The learner reported that the task felt easier than expected."
      : post.perceivedDifficulty > pre.expectedDifficulty
        ? "The learner reported that the task felt harder than expected."
        : "The learner reported difficulty close to the initial expectation.";
    items.push(evidence(
      SUMMARY_EVIDENCE_TYPE.CAUTIOUS_INTERPRETATION,
      "Difficulty context",
      `${description} This may reflect expectation calibration, task conditions, or support received, and it does not establish learning gain or ability change.`
    ));
  }
  if (perceivedAttention) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Perceived attention", `The learner rated perceived attention as ${perceivedAttention}.`));
  if (perceivedFatigue) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Perceived fatigue", `The learner rated perceived fatigue as ${perceivedFatigue}.`));
  if (sessionMood) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Overall session mood", `The learner rated overall session mood as ${sessionMood}.`));
  if (sessionEnergy) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Overall session energy", `The learner rated overall session energy as ${sessionEnergy}.`));
  if (taskConfidence) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Initial task confidence", `The learner rated initial task confidence as ${taskConfidence}.`));
  if (taskValue) items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Task value", `The learner rated task value as ${taskValue}.`));

  if (!hasEvidence(items) && includeLimitations) {
    items.push(evidence(
      SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION,
      "Learner experience unavailable",
      "No learner-reported experience ratings were saved for this session."
    ));
  }

  if (!hasEvidence(items)) return null;
  return section(
    "experience-difficulty",
    "Experience & Difficulty",
    "Learner-reported ratings are summarized on their original 1-5 scales and are not treated as objective measurements.",
    SUMMARY_CONFIDENCE.MODERATE,
    items
  );
};

const buildObservedSignalsSection = (statistics, thresholdProfile, { includeLimitations = true } = {}) => {
  const items = [];
  const coverage = statistics?.dataCoverage;
  const attention = metricMean(statistics, "attention");
  const fatigue = metricMean(statistics, "fatigue");
  const valence = metricMean(statistics, "valence");
  const arousal = metricMean(statistics, "arousal");
  const coverageLabel = formatCoverage(coverage);
  const hasModelStatistic = [attention, fatigue, valence, arousal].some(isFiniteNumber);

  if (coverageLabel && hasModelStatistic) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION, "Data coverage", `Model-data coverage was ${coverageLabel}.`));
    if (coverage < thresholdProfile.minimumCoverage) {
      items.push(evidence(SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION, "Coverage limitation", "Coverage was below the existing minimum threshold, so model-estimated signals should be read as limited descriptive context."));
    }
  } else if (coverageLabel && includeLimitations) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION, "Model statistics unavailable", `Model-data coverage was ${coverageLabel}, but no finite model-estimated session statistics were saved.`));
  } else if (includeLimitations) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION, "Coverage unavailable", "Model-data coverage is unavailable for this session."));
  }

  if (isFiniteNumber(attention)) items.push(evidence(SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION, "Estimated attention", `The model-estimated attention average was ${formatMetric(attention)}.`));
  if (isFiniteNumber(fatigue)) items.push(evidence(SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION, "Estimated fatigue", `The model-estimated fatigue average was ${formatMetric(fatigue)}.`));
  if (isFiniteNumber(valence)) items.push(evidence(SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION, "Estimated facial valence", `The model-estimated facial valence average was ${formatMetric(valence, "affect")} on the stored affect scale.`));
  if (isFiniteNumber(arousal)) items.push(evidence(SUMMARY_EVIDENCE_TYPE.MODEL_OBSERVATION, "Estimated facial arousal", `The model-estimated facial arousal average was ${formatMetric(arousal, "affect")} on the stored affect scale.`));

  if (!hasModelStatistic && includeLimitations && !coverageLabel) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION, "Model statistics unavailable", "Persisted model-estimated session statistics are unavailable for this session."));
  }

  if (!hasEvidence(items)) return null;

  return section(
    "observed-study-signals",
    "Observed Study Signals",
    "Model-estimated signals are reported on their stored scales and are not treated as objective measurements.",
    isFiniteNumber(coverage) && coverage >= thresholdProfile.minimumCoverage ? SUMMARY_CONFIDENCE.MODERATE : SUMMARY_CONFIDENCE.INSUFFICIENT,
    items
  );
};

const buildLearningApproachSection = (post) => {
  const items = [];
  const strategies = selectedStrategies(post);
  const primaryStrategy = post.primaryStrategy && post.primaryStrategy !== "none_or_unsure" ? post.primaryStrategy : null;
  const primaryLabel = primaryStrategy ? formatStrategyLabel(primaryStrategy) : null;
  const effectiveness = primaryStrategy ? ratingText(post.primaryStrategyEffectiveness) : null;
  const otherStrategies = strategies.filter((strategyValue) => strategyValue !== "none_or_unsure" && strategyValue !== primaryStrategy);
  const otherLabels = otherStrategies.map(formatStrategyLabel).filter((label) => label !== "Not provided");
  const learningActivity = post.primaryLearningActivity ? formatLearningActivityLabel(post.primaryLearningActivity) : null;

  if (primaryLabel && primaryLabel !== "Not provided") {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Primary strategy", `The learner selected ${primaryLabel} as the primary strategy.`));
  }
  if (effectiveness) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Primary strategy effectiveness", `The learner rated the selected primary strategy effectiveness as ${effectiveness}.`));
  }
  if (otherLabels.length > 0) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Other strategies", `The learner also reported using ${otherLabels.join(", ")}.`));
  }
  if (learningActivity && learningActivity !== "Not provided") {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Reported primary learning activity", `The learner reported the primary learning activity as ${learningActivity}.`));
  }
  if (strategies.includes("none_or_unsure")) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Strategies used", "The learner selected None / Not sure for strategies used; no negative judgment is inferred from this response."));
  }

  if (!hasEvidence(items)) return null;
  return section(
    "learning-approach",
    "Learning Approach",
    "Reported strategies and learning activity are learner reports and do not establish a reason for the session outcome.",
    SUMMARY_CONFIDENCE.MODERATE,
    items
  );
};

const buildReflectionSection = (post, { includeLimitations = true } = {}) => {
  const items = [];
  const reflection = cleanText(post.learningReflection);
  const adjustment = cleanText(post.nextSessionAdjustment);

  if (reflection) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Learning reflection", `The learner wrote: "${reflection}"`));
  }
  if (adjustment) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.LEARNER_REPORT, "Next-session adjustment", `The learner chose this next-session adjustment: "${adjustment}"`));
  }
  if (!reflection && !adjustment && includeLimitations) {
    items.push(evidence(SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION, "Reflection unavailable", "No learner reflection or next-session adjustment was saved for this session."));
  }

  if (!hasEvidence(items)) return null;

  return section(
    "reflection-next-session",
    "Reflection & Next Session",
    "Saved reflection and next-session adjustment are presented as learner-authored information, not system-prescribed advice.",
    reflection || adjustment ? SUMMARY_CONFIDENCE.MODERATE : SUMMARY_CONFIDENCE.LOW,
    items
  );
};

/** Generate a deterministic, evidence-aware completed-session summary from stored session-level data. @param {{statistics:Object,session?:Object,thresholds?:Object,algorithmVersion?:string,now?:Function}=} input @returns {import("./sessionSchema.js").SessionSummary} */
export const generateSessionSummary = ({
  statistics,
  session: sessionInput = {},
  thresholds,
  algorithmVersion = SESSION_SUMMARY_ALGORITHM_VERSION,
  now = () => new Date().toISOString(),
} = {}) => {
  const thresholdProfile = mergeThresholds(thresholds);
  const session = sessionInput || {};
  const pre = session.preSessionCheckIn || {};
  const post = session.postSessionCheckOut || {};
  const generatedAt = now();
  const hasModelEvidence = hasFiniteModelStatistic(statistics);

  const goalOutcome = buildGoalOutcomeSection(session, post);
  const experienceDifficulty = buildExperienceSection(pre, post);
  const learningApproach = buildLearningApproachSection(post);
  const hasSubstantiveEvidence = Boolean(goalOutcome || experienceDifficulty || learningApproach || hasModelEvidence);
  const experienceWithLimitations = experienceDifficulty || buildExperienceSection(pre, post, {
    includeLimitations: hasModelEvidence,
  });
  const observedStudySignals = buildObservedSignalsSection(statistics, thresholdProfile, {
    includeLimitations: hasSubstantiveEvidence,
  });
  const reflectionNextSession = buildReflectionSection(post, {
    includeLimitations: hasSubstantiveEvidence,
  });
  const evidenceSections = [
    goalOutcome,
    experienceWithLimitations,
    observedStudySignals,
    learningApproach,
    reflectionNextSession,
  ].filter(Boolean);

  if (evidenceSections.length === 0) {
    const unavailable = section(
      "summary-unavailable",
      "Summary unavailable",
      "The available Session record does not contain enough saved evidence to produce an evidence-aware summary.",
      SUMMARY_CONFIDENCE.INSUFFICIENT,
      [evidence(SUMMARY_EVIDENCE_TYPE.DATA_LIMITATION, "Evidence unavailable", "No usable Session record, learner-report, or model-observation evidence was available.")]
    );
    return {
      summaryVersion: 2,
      overallStatus: unavailable,
      summaryUnavailable: unavailable,
      generatedAt,
      algorithmVersion,
      thresholdProfile,
    };
  }

  const coverage = statistics?.dataCoverage;
  const confidence = isFiniteNumber(coverage) && coverage >= thresholdProfile.minimumCoverage
    ? SUMMARY_CONFIDENCE.MODERATE
    : SUMMARY_CONFIDENCE.LOW;
  const overallStatus = section(
    "evidence-aware-summary",
    "Evidence-aware summary",
    "This deterministic summary separates Session records, learner reports, model observations, cautious interpretations, and data limitations.",
    confidence,
    [evidence(SUMMARY_EVIDENCE_TYPE.CAUTIOUS_INTERPRETATION, "Interpretive boundary", "The available evidence can provide context for this Session, but it does not establish clinical conclusions, stable personal patterns, future performance, or which evidence source is correct.")]
  );

  return {
    summaryVersion: 2,
    overallStatus,
    ...(goalOutcome ? { goalOutcome } : {}),
    ...(experienceWithLimitations ? { experienceDifficulty: experienceWithLimitations } : {}),
    ...(observedStudySignals ? { observedStudySignals } : {}),
    ...(learningApproach ? { learningApproach } : {}),
    ...(reflectionNextSession ? { reflectionNextSession } : {}),
    generatedAt,
    algorithmVersion,
    thresholdProfile,
  };
};
