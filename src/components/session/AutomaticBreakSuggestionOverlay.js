"use client";

import { useEffect, useRef } from "react";
import {
  AUTOMATIC_SUGGESTION_LEVEL,
  AUTOMATIC_SUGGESTION_PHASE,
  isWeakSuggestionLevel,
} from "../../services/session/automaticBreakSuggestionState.js";

const formatDurationChoice = (durationMs, unitLabel) => {
  const divisor = unitLabel === "seconds" ? 1000 : 60000;
  return `${Math.round(durationMs / divisor)} ${unitLabel}`;
};

const levelCopy = {
  [AUTOMATIC_SUGGESTION_LEVEL.WEAK_1]: {
    title: "Time for a short reset?",
    message: "You have been focused for a while. A brief break can help you return with a clearer head.",
  },
  [AUTOMATIC_SUGGESTION_LEVEL.WEAK_2]: {
    title: "Consider stepping away",
    message: "Your study stretch is getting longer. This is a good moment to pause before continuing.",
  },
  [AUTOMATIC_SUGGESTION_LEVEL.STRONG_1]: {
    title: "A break is strongly recommended",
    message: "You have been studying continuously for a long time. A short break may help protect your focus and reduce fatigue.",
  },
  [AUTOMATIC_SUGGESTION_LEVEL.STRONG_2]: {
    title: "Please consider a break",
    message: "This has been a sustained study stretch. Taking a short break now can make the next block feel steadier.",
  },
};

export default function AutomaticBreakSuggestionOverlay({ state, actions }) {
  const prompt = state?.activePrompt;
  const primaryButtonRef = useRef(null);
  const isWeakPrompt = isWeakSuggestionLevel(prompt?.level);
  const copy = levelCopy[prompt?.level] || levelCopy[AUTOMATIC_SUGGESTION_LEVEL.WEAK_1];

  useEffect(() => {
    if (!prompt) return undefined;
    const timeout = window.setTimeout(() => primaryButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [prompt]);

  useEffect(() => {
    if (!prompt) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (prompt.phase === AUTOMATIC_SUGGESTION_PHASE.DURATION_CHOOSER) {
        actions.cancelDurationChooser();
      } else if (prompt.phase === AUTOMATIC_SUGGESTION_PHASE.CONTINUE_CONFIRMATION) {
        actions.cancelContinueStudy();
      } else if (isWeakPrompt) {
        actions.remindMeLater();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, isWeakPrompt, prompt]);

  if (!prompt) return null;

  if (prompt.phase === AUTOMATIC_SUGGESTION_PHASE.CONTINUE_CONFIRMATION) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-live="polite">
        <div className="w-full max-w-md rounded-2xl border border-amber-200/30 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-slate-950/60">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Break suggestion</p>
          <h2 className="mt-3 text-2xl font-black">Continue studying?</h2>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            You have been studying continuously for a long time. A short break may help protect your focus and reduce fatigue.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={actions.confirmContinueStudy}
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              Confirm
            </button>
            <button
              ref={primaryButtonRef}
              type="button"
              onClick={actions.cancelContinueStudy}
              className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (prompt.phase === AUTOMATIC_SUGGESTION_PHASE.DURATION_CHOOSER) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-live="polite">
        <div className="w-full max-w-md rounded-2xl border border-cyan-200/30 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-slate-950/60">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Start a break</p>
          <h2 className="mt-3 text-2xl font-black">Choose your break length</h2>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {(state?.durationChoicesMs || []).map((durationMs) => (
              <button
                key={durationMs}
                type="button"
                onClick={() => actions.startSuggestedBreak(durationMs)}
                className="rounded-xl border border-cyan-300/50 bg-cyan-300/15 px-4 py-3 text-sm font-bold text-cyan-50 shadow-lg shadow-cyan-950/20 transition hover:border-cyan-200 hover:bg-cyan-300/25 focus:outline-none focus:ring-2 focus:ring-cyan-200"
              >
                {formatDurationChoice(durationMs, state.unitLabel)}
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              ref={primaryButtonRef}
              type="button"
              onClick={actions.cancelDurationChooser}
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-live="polite">
      <div className="relative w-full max-w-md rounded-2xl border border-cyan-200/30 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-slate-950/60">
        {isWeakPrompt && (
          <button
            type="button"
            onClick={actions.remindMeLater}
            className="absolute right-4 top-4 rounded-full border border-slate-600 px-2 py-1 text-xs font-black text-slate-300 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            aria-label="Remind me later"
          >
            X
          </button>
        )}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Break suggestion</p>
        <h2 className="mt-3 pr-8 text-2xl font-black">{copy.title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-200">{copy.message}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={isWeakPrompt ? actions.remindMeLater : actions.requestContinueStudy}
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {isWeakPrompt ? "Remind Me Later" : "Continue Study"}
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={actions.openDurationChooser}
            className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          >
            Start a Break Now
          </button>
        </div>
      </div>
    </div>
  );
}
