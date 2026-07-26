"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_ADVANCE_IDLE_MS,
  NAV_DIRECTION,
  QUESTION_TRANSITION_MS,
  REDUCED_MOTION_TRANSITION_MS,
  TRANSITION_PHASE,
  getCircularNavButtonClass,
  getQuestionTransitionClass,
  isSingleChoiceAutoAdvanceStep,
} from "./questionnaireNavigation.js";

const ratingQuestions = [
  { id: "sessionEnergy", question: "How alert and energetic did you feel overall during this study session?", anchors: ["1 = Very low or sleepy", "3 = Moderate", "5 = Very alert and energetic"] },
  { id: "sessionMood", question: "How negative or positive did you feel overall during this study session?", anchors: ["1 = Very negative", "3 = Neutral", "5 = Very positive"] },
  { id: "perceivedFatigue", question: "How mentally or physically fatigued did you feel during this session?", anchors: ["1 = Not fatigued", "3 = Moderately fatigued", "5 = Very fatigued"] },
  { id: "perceivedAttention", question: "How well were you able to keep your attention on the task?", anchors: ["1 = Not well", "3 = Moderately well", "5 = Very well"] },
  { id: "perceivedDifficulty", question: "How difficult did the task feel during the session?", anchors: ["1 = Very easy", "3 = Moderate", "5 = Very difficult"] },
];

const strategyOptions = [
  ["rehearsal", "Rehearsal", "Repeated, reread, recited, or memorized information."],
  ["elaboration", "Elaboration", "Summarized in your own words, created examples, or connected new ideas to prior knowledge."],
  ["organization", "Organization", "Categorized information, created an outline, table, diagram, concept map, or structured notes."],
  ["critical_thinking", "Critical thinking", "Questioned ideas or evidence, compared explanations, or applied knowledge to a new problem."],
  ["metacognitive_self_regulation", "Metacognitive self-regulation", "Planned your approach, checked your understanding, and adjusted your strategy when needed."],
  ["none_or_unsure", "None / Not sure", "Use this when you do not want to record a specific strategy."],
];

const learningActivities = [
  ["received_information", "Received information", "I mainly read, listened to, or watched the material without producing substantial new output."],
  ["worked_with_material", "Worked with the material", "I mainly highlighted, copied, repeated, selected answers, or manipulated existing information."],
  ["generated_new_understanding", "Generated new understanding", "I mainly solved problems, explained ideas in my own words, summarized, derived, or formed new connections."],
  ["built_understanding_with_others", "Built understanding with others", "I mainly developed understanding through substantive discussion, mutual explanation, and feedback."],
  ["mixed_or_unsure", "Mixed / Not sure", "This session mixed several approaches, or you are not sure which best fits."],
];

const initialReflection = {
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
  learningReflection: "",
  nextSessionAdjustment: "",
};

const ratingLabel = (question, value) => `${value}. ${question.anchors.find((anchor) => anchor.startsWith(`${value} =`)) || ""}`;
const substantiveStrategies = (strategies) => strategies.filter((strategy) => strategy !== "none_or_unsure");

export default function PostSessionReflectionDialog({
  open,
  session,
  isSaving = false,
  onSave,
  onCancel,
}) {
  const closeRef = useRef(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState(initialReflection);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(NAV_DIRECTION.FORWARD);
  const [transitionPhase, setTransitionPhase] = useState(TRANSITION_PHASE.IDLE);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const advanceTimerRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const pendingStepIdRef = useRef(null);

  const steps = useMemo(() => {
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
  }, [draft.strategiesUsed, session?.sessionGoal]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery?.matches === true);
    updatePreference();
    mediaQuery?.addEventListener?.("change", updatePreference);
    return () => mediaQuery?.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(advanceTimerRef.current);
    window.clearTimeout(transitionTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const updateDraft = (updates) => setDraft((previous) => ({ ...previous, ...updates }));
  const cancelPendingAdvance = () => {
    window.clearTimeout(advanceTimerRef.current);
    pendingStepIdRef.current = null;
  };
  const navigateReflection = (direction) => {
    if (isAdvancing || showFinishConfirm) return;
    cancelPendingAdvance();
    setIsAdvancing(true);
    setTransitionDirection(direction);
    setTransitionPhase(TRANSITION_PHASE.EXITING);
    const transitionMs = prefersReducedMotion ? REDUCED_MOTION_TRANSITION_MS : QUESTION_TRANSITION_MS;
    window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      if (direction === NAV_DIRECTION.BACKWARD) {
        if (stepIndex === 0) {
          onCancel();
          return;
        }
        setStepIndex((previous) => Math.max(0, previous - 1));
      } else {
        setStepIndex((previous) => Math.min(previous + 1, steps.length - 1));
      }
      setTransitionPhase(TRANSITION_PHASE.ENTERING);
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = window.setTimeout(() => {
        setTransitionPhase(TRANSITION_PHASE.IDLE);
        setIsAdvancing(false);
      }, transitionMs);
    }, transitionMs);
  };
  const advance = () => navigateReflection(NAV_DIRECTION.FORWARD);
  const goBack = () => navigateReflection(NAV_DIRECTION.BACKWARD);
  const scheduleAdvance = (stepId) => {
    window.clearTimeout(advanceTimerRef.current);
    pendingStepIdRef.current = stepId;
    advanceTimerRef.current = window.setTimeout(() => {
      if (pendingStepIdRef.current !== stepId || currentStep?.id !== stepId || isAdvancing || showFinishConfirm) return;
      pendingStepIdRef.current = null;
      navigateReflection(NAV_DIRECTION.FORWARD);
    }, AUTO_ADVANCE_IDLE_MS);
  };
  const requestFinishWithoutReflection = () => {
    cancelPendingAdvance();
    setShowFinishConfirm(true);
  };

  const saveReflection = (skipRemaining = false) => {
    cancelPendingAdvance();
    const response = {
      ...draft,
      learningReflection: draft.learningReflection.trim() || null,
      nextSessionAdjustment: draft.nextSessionAdjustment.trim() || null,
      recordedAt: new Date().toISOString(),
    };
    onSave(response, { skipRemaining });
  };

  const toggleStrategy = (value) => {
    setDraft((previous) => {
      const current = previous.strategiesUsed;
      const next = value === "none_or_unsure"
        ? (current.includes("none_or_unsure") ? [] : ["none_or_unsure"])
        : current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current.filter((item) => item !== "none_or_unsure"), value];
      const selectedSubstantive = substantiveStrategies(next);
      const primaryStillValid = previous.primaryStrategy && selectedSubstantive.includes(previous.primaryStrategy);
      return {
        ...previous,
        strategiesUsed: next,
        primaryStrategy: primaryStillValid ? previous.primaryStrategy : null,
        primaryStrategyEffectiveness: primaryStillValid ? previous.primaryStrategyEffectiveness : null,
      };
    });
  };

  const isOrdinaryStep = currentStep.type !== "complete";
  const transitionClass = getQuestionTransitionClass({
    direction: transitionDirection,
    phase: transitionPhase,
    reducedMotion: prefersReducedMotion,
  });

  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="post-session-reflection-title" className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 text-white shadow-2xl">
        {isOrdinaryStep && (
          <>
            <button
              type="button"
              aria-label="Previous question"
              onClick={goBack}
              disabled={isSaving || isAdvancing || showFinishConfirm}
              className={`${getCircularNavButtonClass({ theme: "emerald" })} left-2 sm:-left-5`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next question"
              onClick={advance}
              disabled={isSaving || isAdvancing || showFinishConfirm}
              className={`${getCircularNavButtonClass({ theme: "emerald" })} right-2 sm:-right-5`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
        <div className={`px-9 sm:px-10 ${isOrdinaryStep ? transitionClass : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">Theory-informed session check-in and reflection</p>
            <h2 id="post-session-reflection-title" className="mt-3 text-2xl font-black">
              {currentStep.question}
            </h2>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Please reflect on your overall experience during this study session, not only how you feel right now.
        </p>
        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500" aria-live="polite">
          Reflection · {Math.min(stepIndex + 1, steps.length)} of {steps.length}
        </p>

        <div className="mt-6">
          {currentStep.type === "rating" && (
            <fieldset>
              <legend className="sr-only">{currentStep.question}</legend>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => {
                  const selected = draft[currentStep.id] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isAdvancing || isSaving || showFinishConfirm}
                      aria-label={ratingLabel(currentStep, value)}
                      onClick={() => {
                        updateDraft({ [currentStep.id]: value });
                        if (isSingleChoiceAutoAdvanceStep(currentStep, value)) scheduleAdvance(currentStep.id);
                      }}
                      className={`rounded-xl border px-3 py-4 text-lg font-black transition-all ${selected ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-emerald-400/40"}`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                {currentStep.anchors.map((anchor) => <span key={anchor}>{anchor}</span>)}
              </div>
            </fieldset>
          )}

          {currentStep.type === "strategies" && (
            <div>
              <p className="text-sm text-slate-400">{currentStep.subtitle}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {strategyOptions.map(([value, label, description]) => {
                  const selected = draft.strategiesUsed.includes(value);
                  return (
                    <button key={value} type="button" disabled={isAdvancing || isSaving || showFinishConfirm} onClick={() => toggleStrategy(value)} className={`rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-emerald-400/40"}`}>
                      <span className="block text-sm font-bold">{label}</span>
                      <span className={`mt-1 block text-xs ${selected ? "text-slate-800" : "text-slate-500"}`}>{description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep.type === "primaryStrategy" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {currentStep.strategies.map((value) => {
                const option = strategyOptions.find(([id]) => id === value);
                const selected = draft.primaryStrategy === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={isAdvancing || isSaving || showFinishConfirm}
                    onClick={() => {
                      updateDraft({ primaryStrategy: value, primaryStrategyEffectiveness: null });
                      scheduleAdvance(currentStep.id);
                    }}
                    className={`rounded-xl border p-3 text-left text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-emerald-400/40"}`}
                  >
                    {option?.[1] || value}
                  </button>
                );
              })}
            </div>
          )}

          {currentStep.type === "learningActivity" && (
            <div className="space-y-2">
              {learningActivities.map(([value, label, description]) => {
                const selected = draft.primaryLearningActivity === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={isAdvancing || isSaving || showFinishConfirm}
                    onClick={() => {
                      updateDraft({ primaryLearningActivity: value });
                      scheduleAdvance(currentStep.id);
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-emerald-400/40"}`}
                  >
                    <span className="block text-sm font-bold">{label}</span>
                    <span className={`mt-1 block text-xs ${selected ? "text-slate-800" : "text-slate-500"}`}>{description}</span>
                  </button>
                );
              })}
            </div>
          )}

          {currentStep.type === "text" && (
            <label className="block">
              <span className="sr-only">{currentStep.question}</span>
              <textarea
                value={draft[currentStep.id]}
                maxLength={300}
                disabled={isSaving || isAdvancing || showFinishConfirm}
                onChange={(event) => updateDraft({ [currentStep.id]: event.target.value })}
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="mt-1 block text-right text-[10px] text-slate-500">{draft[currentStep.id].length}/300</span>
            </label>
          )}

          {currentStep.type === "complete" && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              Your study session and any answers you provided will be saved to local history.
            </div>
          )}
        </div>

        </div>

        {showFinishConfirm && (
          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-sm font-bold text-amber-100">Finish without completing the remaining reflection?</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
              Your study session and any answers already provided will still be saved. Unanswered reflection items will remain blank.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setShowFinishConfirm(false);
                  closeRef.current?.focus();
                }}
                className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
              >
                Continue Reflection
              </button>
              <button type="button" onClick={() => saveReflection(true)} disabled={isSaving} className="rounded-xl bg-amber-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">Finish Session</button>
            </div>
          </div>
        )}

        {isOrdinaryStep ? (
          <div className="mt-7 flex justify-end px-9 sm:px-10">
            <button
              ref={closeRef}
              type="button"
              onClick={requestFinishWithoutReflection}
              disabled={isSaving || isAdvancing || showFinishConfirm}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 transition-all hover:bg-white/5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Finish Without Reflection
            </button>
          </div>
        ) : (
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={goBack} disabled={isSaving || isAdvancing} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 disabled:opacity-60">
              Back
            </button>
            <button type="button" onClick={() => saveReflection(false)} disabled={isSaving} className="flex-1 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70">
              {isSaving ? "Saving..." : "Save and View Dashboard"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
