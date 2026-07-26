"use client";

import React, { useEffect, useRef } from "react";
import {
  BREAK_DECISION_WAIT_MS,
  MAX_BREAK_EXTENSION_COUNT,
} from "../../services/session/sessionConstants.js";
import {
  BREAK_PHASE,
  formatCountdown,
} from "../../services/session/timedBreakState.js";

function TimedBreakDialog({ state, actions }) {
  const primaryRef = useRef(null);
  const phase = state.phase;
  const isOpen = [
    BREAK_PHASE.READY,
    BREAK_PHASE.SKIP_CONFIRMATION,
    BREAK_PHASE.END_EARLY_CONFIRMATION,
    BREAK_PHASE.COMPLETE_DECISION,
  ].includes(phase);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement;
    const timeout = window.setTimeout(() => primaryRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (phase === BREAK_PHASE.SKIP_CONFIRMATION) actions.cancelSkipBreak();
      if (phase === BREAK_PHASE.END_EARLY_CONFIRMATION) actions.cancelEndBreakEarly();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
  }, [actions, isOpen, phase]);

  if (!isOpen) return null;

  let title = "This is your break time!";
  let body = "Step away for a moment and let your focus reset.";
  let controls = (
    <>
      <button ref={primaryRef} type="button" onClick={actions.startReadyBreak} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
        Start Your Break Now
      </button>
      <button type="button" onClick={actions.requestSkipBreak} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
        Skip This Break
      </button>
    </>
  );

  if (phase === BREAK_PHASE.SKIP_CONFIRMATION) {
    title = "Skip this planned break?";
    body = "Regular breaks can help protect your focus and reduce fatigue. Are you sure you want to skip this break?";
    controls = (
      <>
        <button ref={primaryRef} type="button" onClick={actions.cancelSkipBreak} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
          Cancel
        </button>
        <button type="button" onClick={actions.confirmSkipBreak} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
          Confirm
        </button>
      </>
    );
  } else if (phase === BREAK_PHASE.END_EARLY_CONFIRMATION) {
    title = "End your break early?";
    body = "Taking the full break can help you return with better focus. Do you still want to end your break early?";
    controls = (
      <>
        <button ref={primaryRef} type="button" onClick={actions.cancelEndBreakEarly} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
          Cancel
        </button>
        <button type="button" onClick={actions.confirmEndBreakEarly} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
          Confirm
        </button>
      </>
    );
  } else if (phase === BREAK_PHASE.COMPLETE_DECISION) {
    title = "Break complete";
    body = "You can return to your study session now, or take one short extension.";
    controls = (
      <>
        <button ref={primaryRef} type="button" onClick={actions.continueStudyAfterBreak} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200">
          Continue Study
        </button>
        {state.extensionCount < MAX_BREAK_EXTENSION_COUNT && (
          <button type="button" onClick={() => actions.extendBreak("manual")} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300">
            Extend Break by 3 Minutes
          </button>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="timed-break-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Planned Break</p>
        <h2 id="timed-break-title" className="mt-3 text-2xl font-black">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{body}</p>
        {phase === BREAK_PHASE.COMPLETE_DECISION && (
          <p className="mt-3 text-xs text-slate-500" aria-live="polite">
            Automatic extension in {formatCountdown(Math.max(0, BREAK_DECISION_WAIT_MS - state.decisionElapsedMs))}.
          </p>
        )}
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">{controls}</div>
      </section>
    </div>
  );
}

function TimedBreakWarning({ state }) {
  if (state.phase !== BREAK_PHASE.WARNING) return null;
  return (
    <div className="fixed inset-x-4 top-20 z-[850] mx-auto max-w-md rounded-2xl border border-cyan-300/25 bg-slate-950/92 p-4 text-white shadow-2xl backdrop-blur-xl" role="status" aria-live="polite">
      <p className="text-sm font-black text-cyan-200">Break in {formatCountdown(state.remainingMs)}</p>
      <p className="mt-1 text-xs text-slate-300">You&apos;re almost there. Keep going for a little longer.</p>
    </div>
  );
}

export default function TimedBreakOverlay({ state, actions }) {
  return (
    <>
      <TimedBreakWarning state={state} />
      <TimedBreakDialog state={state} actions={actions} />
    </>
  );
}
