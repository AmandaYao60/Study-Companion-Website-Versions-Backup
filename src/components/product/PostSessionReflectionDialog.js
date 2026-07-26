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
import { normalizePostSessionReflectionDraft } from "../../services/session/sessionSelfReport.js";
import {
  createPostSessionReflectionSteps,
  hasPreviousPostSessionStep,
  initialReflection,
  learningActivities,
  resolvePostSessionStepIndex,
  shouldShowCenteredPostSessionContinue,
  strategyOptions,
  substantiveStrategies,
} from "./postSessionReflectionState.js";

const ratingLabel = (question, value) => `${value}. ${question.anchors.find((anchor) => anchor.startsWith(`${value} =`)) || ""}`;

export default function PostSessionReflectionDialog({
  open,
  session,
  reflectionDraft = null,
  isSaving = false,
  onDraftChange,
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
  const loadedSessionRef = useRef(null);
  const persistedDraftKeyRef = useRef("");
  const skipNextPersistRef = useRef(false);

  const steps = useMemo(() => (
    createPostSessionReflectionSteps({ draft, session })
  ), [draft, session]);

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
    if (!open) {
      loadedSessionRef.current = null;
      persistedDraftKeyRef.current = "";
      return;
    }
    if (!session?.id || loadedSessionRef.current === session.id) return;
    const recoveredDraft = normalizePostSessionReflectionDraft(reflectionDraft, { sessionId: session.id });
    const nextDraft = recoveredDraft?.answers || initialReflection;
    const nextSteps = createPostSessionReflectionSteps({ draft: nextDraft, session });
    setDraft(nextDraft);
    setStepIndex(resolvePostSessionStepIndex(nextSteps, recoveredDraft?.currentStepId));
    setShowFinishConfirm(false);
    setIsAdvancing(false);
    setTransitionDirection(NAV_DIRECTION.FORWARD);
    setTransitionPhase(TRANSITION_PHASE.IDLE);
    window.clearTimeout(advanceTimerRef.current);
    window.clearTimeout(transitionTimerRef.current);
    pendingStepIdRef.current = null;
    skipNextPersistRef.current = Boolean(recoveredDraft);
    loadedSessionRef.current = session.id;
  }, [open, reflectionDraft, session]);

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

  useEffect(() => {
    if (!open || !session?.id || !currentStep?.id || typeof onDraftChange !== "function") return;
    const draftCore = {
      sessionId: session.id,
      status: "pending",
      currentStepId: currentStep.id,
      answers: draft,
    };
    const nextKey = JSON.stringify(draftCore);
    if (persistedDraftKeyRef.current === nextKey) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    persistedDraftKeyRef.current = nextKey;
    void onDraftChange({
      ...draftCore,
      updatedAt: new Date().toISOString(),
    }).catch((error) => {
      console.error("Failed to persist post-session reflection draft:", error);
    });
  }, [currentStep?.id, draft, onDraftChange, open, session?.id]);

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
  const hasPreviousStep = isOrdinaryStep && hasPreviousPostSessionStep(steps, currentStep);
  const showCenteredContinue = isOrdinaryStep && shouldShowCenteredPostSessionContinue(currentStep);
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
            {hasPreviousStep && (
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
            )}
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
          <div className="mt-7 grid grid-cols-1 items-center gap-3 px-9 sm:grid-cols-[1fr_auto_1fr] sm:px-10">
            <span className="hidden sm:block" aria-hidden="true" />
            {showCenteredContinue ? (
              <button
                type="button"
                aria-label="Continue to next question"
                onClick={advance}
                disabled={isSaving || isAdvancing || showFinishConfirm}
                className="justify-self-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-2 text-sm font-bold text-emerald-100 transition-all hover:bg-emerald-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <span className="hidden sm:block" aria-hidden="true" />
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={requestFinishWithoutReflection}
              disabled={isSaving || isAdvancing || showFinishConfirm}
              className="justify-self-center rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 transition-all hover:bg-white/5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 sm:justify-self-end"
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
