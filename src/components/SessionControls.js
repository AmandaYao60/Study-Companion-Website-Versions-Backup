"use client";

import React, { useRef } from "react";
import { useAppState } from "../context/AppContext";

const minutesToMs = (minutes) => {
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes) || numericMinutes <= 0) return null;
  return Math.round(numericMinutes * 60000);
};

export default function SessionControls() {
  const {
    isMonitoring,
    activeSession,
    activeSessionSamples,
    completedSessions,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    discardSession,
    updateSessionTask,
    updateTargetDuration,
  } = useAppState();

  const taskInputRef = useRef(null);
  const targetInputRef = useRef(null);

  const getTaskDraft = () => taskInputRef.current?.value?.trim() || "";
  const getTargetDurationMs = () => minutesToMs(targetInputRef.current?.value);
  const hasActiveSession = Boolean(activeSession);
  const isPausedSession = hasActiveSession && activeSession.status === "paused";

  const handlePrimaryAction = async () => {
    if (isMonitoring) {
      await pauseSession();
      return;
    }

    if (isPausedSession) {
      await resumeSession();
      return;
    }

    await startSession({
      taskDescription: getTaskDraft(),
      targetDurationMs: getTargetDurationMs(),
    });
  };

  const handleTaskBlur = () => {
    if (!hasActiveSession) return;
    void updateSessionTask(getTaskDraft());
  };

  const handleTargetBlur = () => {
    if (!hasActiveSession) return;
    void updateTargetDuration(getTargetDurationMs());
  };

  const handleFinish = async () => {
    if (!hasActiveSession) return;
    const message = activeSessionSamples.length === 0
      ? "Finish this session now? No completed 10-second metric samples have been saved yet."
      : "Finish this session and generate its summary?";
    if (!window.confirm(message)) return;
    await finishSession();
    if (taskInputRef.current) taskInputRef.current.value = "";
    if (targetInputRef.current) targetInputRef.current.value = "";
  };

  const handleDiscard = async () => {
    if (!hasActiveSession) return;
    if (!window.confirm("Discard this active session? Collected samples for it will be deleted.")) return;
    await discardSession();
    if (taskInputRef.current) taskInputRef.current.value = "";
    if (targetInputRef.current) targetInputRef.current.value = "";
  };

  const primaryLabel = isMonitoring
    ? "Pause Session"
    : isPausedSession
      ? "Resume Session"
      : "Start Session";

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Study Session</h2>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {hasActiveSession ? `Status: ${activeSession.status}` : "No active session"}
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">
          {completedSessions.length} completed
        </span>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Study task</span>
          <input
            type="text"
            ref={taskInputRef}
            key={activeSession?.id ? `${activeSession.id}-task` : "new-task"}
            defaultValue={activeSession?.taskDescription || ""}
            onBlur={handleTaskBlur}
            placeholder="What are you studying?"
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:border-cyan-400/50"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target duration (minutes)</span>
          <input
            type="number"
            min="1"
            ref={targetInputRef}
            key={activeSession?.id ? `${activeSession.id}-target` : "new-target"}
            defaultValue={activeSession?.targetDurationMs ? String(Math.round(activeSession.targetDurationMs / 60000)) : ""}
            onBlur={handleTargetBlur}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:border-cyan-400/50"
          />
        </label>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void handlePrimaryAction()}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              isMonitoring
                ? "border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                : "bg-cyan-500 text-slate-950 hover:bg-cyan-300"
            }`}
          >
            {primaryLabel}
          </button>

          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={!hasActiveSession}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-900/40 disabled:text-slate-600"
          >
            Finish Session
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleDiscard()}
          disabled={!hasActiveSession}
          className="w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-slate-600"
        >
          Discard Session
        </button>
      </div>
    </section>
  );
}
