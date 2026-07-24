export const QUESTIONNAIRE_SCHEMA_VERSION = 1;

export const SUBJECT_OPTIONS = Object.freeze([
  "mathematics",
  "physics",
  "chemistry",
  "biology",
  "computer_science",
  "languages",
  "humanities",
  "test_preparation",
  "other",
]);

export const TASK_TYPE_OPTIONS = Object.freeze([
  "learn_new_content",
  "practice_problems",
  "review",
  "memorization",
  "reading",
  "writing",
  "project_work",
  "test_preparation",
  "other",
]);

export const LEARNING_STRATEGY_OPTIONS = Object.freeze([
  "rehearsal",
  "elaboration",
  "organization",
  "critical_thinking",
  "metacognitive_self_regulation",
  "none_or_unsure",
]);

export const SUBSTANTIVE_LEARNING_STRATEGIES = Object.freeze(
  LEARNING_STRATEGY_OPTIONS.filter((value) => value !== "none_or_unsure")
);

export const LEARNING_ACTIVITY_OPTIONS = Object.freeze([
  "received_information",
  "worked_with_material",
  "generated_new_understanding",
  "built_understanding_with_others",
  "mixed_or_unsure",
]);

export const LEARNING_ACTIVITY_ICAP_MAP = Object.freeze({
  received_information: "passive",
  worked_with_material: "active",
  generated_new_understanding: "constructive",
  built_understanding_with_others: "interactive",
  mixed_or_unsure: null,
});

export const PRE_SESSION_DEFAULTS = Object.freeze({
  expectedDifficulty: null,
  taskConfidence: null,
  mood: null,
  energy: null,
  taskValue: null,
  recordedAt: null,
});

export const POST_SESSION_DEFAULTS = Object.freeze({
  sessionEnergy: null,
  sessionMood: null,
  perceivedFatigue: null,
  perceivedAttention: null,
  perceivedDifficulty: null,
  goalAttainment: null,
  strategiesUsed: [],
  primaryStrategy: null,
  primaryStrategyEffectiveness: null,
  primaryLearningActivity: null,
  learningReflection: null,
  nextSessionAdjustment: null,
  recordedAt: null,
});

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const trimText = (value, maxLength = 300) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};
const iso = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : fallback;
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};
const rating = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5 ? numeric : null;
};
const option = (value, allowed) => (allowed.includes(value) ? value : null);

export const normalizePreSessionCheckIn = (value = null) => ({
  ...PRE_SESSION_DEFAULTS,
  expectedDifficulty: rating(value?.expectedDifficulty),
  taskConfidence: rating(value?.taskConfidence),
  mood: rating(value?.mood),
  energy: rating(value?.energy),
  taskValue: rating(value?.taskValue),
  recordedAt: iso(value?.recordedAt, null),
});

export const normalizeStrategiesUsed = (value = []) => {
  const input = Array.isArray(value) ? value : [];
  const unique = Array.from(new Set(input.filter((item) => LEARNING_STRATEGY_OPTIONS.includes(item))));
  if (unique.includes("none_or_unsure")) return ["none_or_unsure"];
  return unique;
};

export const normalizePostSessionCheckOut = (value = null) => {
  const strategiesUsed = normalizeStrategiesUsed(value?.strategiesUsed);
  const substantiveStrategies = strategiesUsed.filter((item) => item !== "none_or_unsure");
  const primaryStrategy = substantiveStrategies.includes(value?.primaryStrategy)
    ? value.primaryStrategy
    : null;

  return {
    ...POST_SESSION_DEFAULTS,
    sessionEnergy: rating(value?.sessionEnergy),
    sessionMood: rating(value?.sessionMood),
    perceivedFatigue: rating(value?.perceivedFatigue),
    perceivedAttention: rating(value?.perceivedAttention),
    perceivedDifficulty: rating(value?.perceivedDifficulty),
    goalAttainment: rating(value?.goalAttainment),
    strategiesUsed,
    primaryStrategy,
    primaryStrategyEffectiveness: primaryStrategy ? rating(value?.primaryStrategyEffectiveness) : null,
    primaryLearningActivity: option(value?.primaryLearningActivity, LEARNING_ACTIVITY_OPTIONS),
    learningReflection: trimText(value?.learningReflection, 300),
    nextSessionAdjustment: trimText(value?.nextSessionAdjustment, 300),
    recordedAt: iso(value?.recordedAt, null),
  };
};

export const validateSelfReportFields = (session, errors) => {
  const pre = session.preSessionCheckIn || {};
  const post = session.postSessionCheckOut || {};
  ["expectedDifficulty", "taskConfidence", "mood", "energy", "taskValue"].forEach((key) => {
    if (pre[key] !== null && (!isFiniteNumber(pre[key]) || pre[key] < 1 || pre[key] > 5 || !Number.isInteger(pre[key]))) {
      errors.push(`preSessionCheckIn.${key} must be an integer from 1 to 5 or null.`);
    }
  });
  [
    "sessionEnergy",
    "sessionMood",
    "perceivedFatigue",
    "perceivedAttention",
    "perceivedDifficulty",
    "goalAttainment",
    "primaryStrategyEffectiveness",
  ].forEach((key) => {
    if (post[key] !== null && (!isFiniteNumber(post[key]) || post[key] < 1 || post[key] > 5 || !Number.isInteger(post[key]))) {
      errors.push(`postSessionCheckOut.${key} must be an integer from 1 to 5 or null.`);
    }
  });
  if (!Array.isArray(post.strategiesUsed)) errors.push("postSessionCheckOut.strategiesUsed must be an array.");
  if (post.primaryStrategy !== null && !post.strategiesUsed?.includes(post.primaryStrategy)) {
    errors.push("postSessionCheckOut.primaryStrategy must be one of the selected strategies or null.");
  }
};

export const formatSubjectLabel = (value) => ({
  mathematics: "Mathematics",
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  computer_science: "Computer Science",
  languages: "Languages",
  humanities: "Humanities",
  test_preparation: "Test Preparation",
  other: "Other",
}[value] || "Not provided");

export const formatTaskTypeLabel = (value) => ({
  learn_new_content: "Learn new content",
  practice_problems: "Practice problems",
  review: "Review",
  memorization: "Memorization",
  reading: "Reading",
  writing: "Writing",
  project_work: "Project work",
  test_preparation: "Test preparation",
  other: "Other",
}[value] || "Not provided");

export const formatStrategyLabel = (value) => ({
  rehearsal: "Rehearsal",
  elaboration: "Elaboration",
  organization: "Organization",
  critical_thinking: "Critical thinking",
  metacognitive_self_regulation: "Metacognitive self-regulation",
  none_or_unsure: "None / Not sure",
}[value] || "Not provided");

export const formatLearningActivityLabel = (value) => ({
  received_information: "Received information",
  worked_with_material: "Worked with the material",
  generated_new_understanding: "Generated new understanding",
  built_understanding_with_others: "Built understanding with others",
  mixed_or_unsure: "Mixed / Not sure",
}[value] || "Not provided");
