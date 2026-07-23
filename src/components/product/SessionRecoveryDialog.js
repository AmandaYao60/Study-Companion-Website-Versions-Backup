"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";
import { formatElapsedTime } from "../../hooks/useSmoothSessionTimer";

const formatCheckpointTime = (value) => {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(time));
};

export default function SessionRecoveryDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeSession,
    isRecoveryPromptOpen,
    returnToRecoveredSession,
    finishSession,
    discardSession,
    addLog,
  } = useAppState();
  const resumeRef = useRef(null);
  const [action, setAction] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isOpen = isRecoveryPromptOpen === true;
  const studyTime = useMemo(() => (
    formatElapsedTime(activeSession?.accumulatedStudyMs || 0)
  ), [activeSession?.accumulatedStudyMs]);
  const checkpointTime = useMemo(() => (
    formatCheckpointTime(activeSession?.lastCheckpointAt || activeSession?.updatedAt)
  ), [activeSession?.lastCheckpointAt, activeSession?.updatedAt]);

  useEffect(() => {
    if (!isOpen || pathname === "/app") return;
    router.replace("/app");
  }, [isOpen, pathname, router]);

  useEffect(() => {
    if (!isOpen || pathname !== "/app") return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    resumeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [isOpen, pathname]);

  if (!isOpen || pathname !== "/app") return null;

  const runAction = async (nextAction, operation) => {
    setAction(nextAction);
    setErrorMessage("");
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to ${nextAction} recovered session:`, error);
      setErrorMessage(`Could not ${nextAction} the recovered session. Please try again.`);
      addLog(`Could not ${nextAction} recovered session: ${message}`, "error");
      return null;
    } finally {
      setAction(null);
    }
  };

  const handleReturn = async () => {
    const session = await runAction("return to", returnToRecoveredSession);
    if (session) setConfirmDiscard(false);
  };

  const handleFinish = async () => {
    const completed = await runAction("finish", finishSession);
    if (completed) router.push("/app/dashboard");
  };

  const handleDiscard = async () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      setErrorMessage("");
      return;
    }

    const discarded = await runAction("discard", discardSession);
    if (discarded) {
      setConfirmDiscard(false);
      router.push("/app");
    }
  };

  const isBusy = Boolean(action);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-recovery-title"
        aria-describedby="session-recovery-description"
        className="w-full max-w-lg rounded-2xl border border-cyan-400/20 bg-slate-950 p-6 text-white shadow-2xl"
      >
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Session Recovery</p>
        <h2 id="session-recovery-title" className="mt-3 text-2xl font-black">
          Session paused after refresh
        </h2>
        <p id="session-recovery-description" className="mt-3 text-sm leading-relaxed text-slate-300">
          We recovered your study session from its latest checkpoint. Time away from this page has not been counted.
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Study time</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-white">{studyTime}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last checkpoint</dt>
            <dd className="mt-1 text-sm font-bold text-cyan-100">{checkpointTime}</dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Returning keeps the session paused. Choose whether to continue without the webcam or enable the camera from the normal Study Space controls.
        </p>

        {confirmDiscard && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100">
            Discarding will permanently delete this unfinished session and its stored metric samples from local history.
          </div>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            ref={resumeRef}
            type="button"
            onClick={() => void handleReturn()}
            disabled={isBusy}
            className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          >
            {action === "return to" ? "Returning..." : "Return to Session"}
          </button>
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={isBusy}
            className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200 transition-all hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
          >
            {action === "finish" ? "Finishing..." : "Finish Session"}
          </button>
          <button
            type="button"
            onClick={() => void handleDiscard()}
            disabled={isBusy}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 transition-all hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            {action === "discard" ? "Discarding..." : confirmDiscard ? "Confirm Discard" : "Discard Session"}
          </button>
        </div>
      </section>
    </div>
  );
}
