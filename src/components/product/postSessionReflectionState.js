import { normalizePostSessionReflectionAnswers } from "../../services/session/sessionSelfReport.js";

export const ratingQuestions = [
  { id: "sessionEnergy", question: "How alert and energetic did you feel overall during this study session?", anchors: ["1 = Very low or sleepy", "3 = Moderate", "5 = Very alert and energetic"] },
  { id: "sessionMood", question: "How negative or positive did you feel overall during this study session?", anchors: ["1 = Very negative", "3 = Neutral", "5 = Very positive"] },
  { id: "perceivedFatigue", question: "How mentally or physically fatigued did you feel during this session?", anchors: ["1 = Not fatigued", "3 = Moderately fatigued", "5 = Very fatigued"] },
  { id: "perceivedAttention", question: "How well were you able to keep your attention on the task?", anchors: ["1 = Not well", "3 = Moderately well", "5 = Very well"] },
  { id: "perceivedDifficulty", question: "How difficult did the task feel during the session?", anchors: ["1 = Very easy", "3 = Moderate", "5 = Very difficult"] },
];

export const strategyOptions = [
  ["rehearsal", "Rehearsal", "Repeated, reread, recited, or memorized information."],
  ["elaboration", "Elaboration", "Summarized in your own words, created examples, or connected new ideas to prior knowledge."],
  ["organization", "Organization", "Categorized information, created an outline, table, diagram, concept map, or structured notes."],
  ["critical_thinking", "Critical thinking", "Questioned ideas or evidence, compared explanations, or applied knowledge to a new problem."],
  ["metacognitive_self_regulation", "Metacognitive self-regulation", "Planned your approach, checked your understanding, and adjusted your strategy when needed."],
  ["none_or_unsure", "None / Not sure", "Use this when you do not want to record a specific strategy."],
];

export const learningActivities = [
  ["received_information", "Received information", "I mainly read, listened to, or watched the material without producing substantial new output."],
  ["worked_with_material", "Worked with the material", "I mainly highlighted, copied, repeated, selected answers, or manipulated existing information."],
  ["generated_new_understanding", "Generated new understanding", "I mainly solved problems, explained ideas in my own words, summarized, derived, or formed new connections."],
  ["built_understanding_with_others", "Built understanding with others", "I mainly developed understanding through substantive discussion, mutual explanation, and feedback."],
  ["mixed_or_unsure", "Mixed / Not sure", "This session mixed several approaches, or you are not sure which best fits."],
];

export const initialReflection = normalizePostSessionReflectionAnswers(null);

export const substantiveStrategies = (strategies) => (
  Array.isArray(strategies) ? strategies.filter((strategy) => strategy !== "none_or_unsure") : []
);

const STEP_ORDER = Object.freeze([
  "sessionEnergy",
  "sessionMood",
  "perceivedFatigue",
  "perceivedAttention",
  "perceivedDifficulty",
  "goalAttainment",
  "strategiesUsed",
  "primaryStrategy",
  "primaryStrategyEffectiveness",
  "primaryLearningActivity",
  "learningReflection",
  "nextSessionAdjustment",
  "complete",
]);

export const createPostSessionReflectionSteps = ({ draft = initialReflection, session = null } = {}) => {
  const goalQuestion = session?.sessionGoal
    ? "To what extent did you achieve your session goal?"
    : "To what extent did you complete what you intended to work on?";
  const selectedSubstantiveStrategies = substantiveStrategies(draft.strategiesUsed);
  return [
    ...ratingQuestions.map((question) => ({ ...question, type: "rating" })),
    { id: "goalAttainment", type: "rating", question: goalQuestion, anchors: ["1 = Not at all", "3 = Partly", "5 = Fully achieved"] },
    { id: "strategiesUsed", type: "strategies", question: "Which learning strategies did you use during this session?", subtitle: "Select all that apply." },
    ...(selectedSubstantiveStrategies.length > 0 ? [
      { id: "primaryStrategy", type: "primaryStrategy", question: "Which strategy contributed most to your progress?", strategies: selectedSubstantiveStrategies },
      { id: "primaryStrategyEffectiveness", type: "rating", question: "How effective was this strategy in helping you make progress?", anchors: ["1 = Not effective", "3 = Moderately effective", "5 = Very effective"] },
    ] : []),
    { id: "primaryLearningActivity", type: "learningActivity", question: "Which option best describes how you worked with the learning material for most of this session?" },
    { id: "learningReflection", type: "text", question: "What did you complete, learn, or improve during this session?" },
    { id: "nextSessionAdjustment", type: "text", question: "Is there anything you would approach differently next time?" },
    { id: "complete", type: "complete", question: "Reflection complete" },
  ];
};

export const resolvePostSessionStepIndex = (steps = [], currentStepId = null) => {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  const exactIndex = steps.findIndex((step) => step.id === currentStepId);
  if (exactIndex >= 0) return exactIndex;
  const orderIndex = STEP_ORDER.indexOf(currentStepId);
  if (orderIndex < 0) return 0;
  for (let index = orderIndex - 1; index >= 0; index -= 1) {
    const fallbackIndex = steps.findIndex((step) => step.id === STEP_ORDER[index]);
    if (fallbackIndex >= 0) return fallbackIndex;
  }
  return 0;
};

export const hasPreviousPostSessionStep = (steps = [], currentStep = null) => (
  steps.findIndex((step) => step.id === currentStep?.id) > 0
);

export const shouldShowCenteredPostSessionContinue = (step = null) => (
  step?.type === "strategies" || step?.type === "text"
);
