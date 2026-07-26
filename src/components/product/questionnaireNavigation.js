export const AUTO_ADVANCE_IDLE_MS = 1000;
export const QUESTION_TRANSITION_MS = 260;
export const REDUCED_MOTION_TRANSITION_MS = 80;

export const NAV_DIRECTION = Object.freeze({
  FORWARD: "forward",
  BACKWARD: "backward",
});

export const TRANSITION_PHASE = Object.freeze({
  IDLE: "idle",
  EXITING: "exiting",
  ENTERING: "entering",
});

export const isSingleChoiceAutoAdvanceStep = (step, value) => {
  if (!step) return false;
  if (step.type === "rating") return Number.isInteger(value);
  if (step.type === "choice") return value !== "other";
  return step.type === "primaryStrategy" || step.type === "learningActivity";
};

export const getQuestionTransitionClass = ({
  direction = NAV_DIRECTION.FORWARD,
  phase = TRANSITION_PHASE.IDLE,
  reducedMotion = false,
} = {}) => {
  const duration = reducedMotion ? "duration-75" : "duration-300";
  const base = `transition-all ${duration} ease-out`;
  if (phase === TRANSITION_PHASE.IDLE) return `${base} translate-x-0 opacity-100`;
  if (reducedMotion) return `${base} translate-x-0 opacity-0`;
  if (phase === TRANSITION_PHASE.EXITING) {
    return `${base} opacity-0 ${direction === NAV_DIRECTION.BACKWARD ? "translate-x-8" : "-translate-x-8"}`;
  }
  return `${base} opacity-0 ${direction === NAV_DIRECTION.BACKWARD ? "-translate-x-8" : "translate-x-8"}`;
};

export const getCircularNavButtonClass = ({ theme = "cyan" } = {}) => {
  const accent = theme === "emerald"
    ? "text-emerald-100 hover:border-emerald-300/50 hover:bg-emerald-400/15 focus-visible:ring-emerald-300"
    : "text-cyan-100 hover:border-cyan-300/50 hover:bg-cyan-400/15 focus-visible:ring-cyan-300";
  return `absolute top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 shadow-xl shadow-slate-950/40 backdrop-blur-md transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 ${accent}`;
};
