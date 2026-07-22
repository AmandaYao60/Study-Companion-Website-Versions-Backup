"use client";

import React from "react";
import Link from "next/link";
import { useAppState } from "../../context/AppContext";
import useSmoothSessionTimer, { formatElapsedTime } from "../../hooks/useSmoothSessionTimer";
import { formatTask } from "../dashboard/dashboardFormatters";

const formatCheckIn = (checkIn) => {
  if (!checkIn) return null;
  const details = [];
  if (checkIn.energy) details.push(`Energy: ${checkIn.energy}`);
  if (checkIn.mood) details.push(`Mood: ${checkIn.mood}`);
  return details.length > 0 ? details.join(" / ") : null;
};

const getFriendlyStudyStatus = ({ activeSession, isMonitoring, focus, fatigue }) => {
  if (!activeSession) return "Set up a study task when you are ready.";
  if (activeSession.status === "prepared") return "Your task is ready. Enable the camera to begin monitoring.";
  if (activeSession.status === "paused" || !isMonitoring) return "Monitoring is paused. Resume when you are ready to continue.";
  if (fatigue >= 70) return "You seem a little tired. It is okay to slow down.";
  if (focus >= 75 && fatigue < 55) return "Deeply focused. Keep this steady rhythm.";
  if (focus < 45) return "Your attention may be drifting. Gently bring it back.";
  return "Your study rhythm is steady. Continue at your own pace.";
};

export default function ActiveSessionCard() {
  const { activeSession, isMonitoring, isCameraAllowed, focus, fatigue } = useAppState();
  const { elapsedMs, formatted } = useSmoothSessionTimer(250);

  if (!activeSession) return null;

  const isPrepared = activeSession.status === "prepared";
  const isPaused = activeSession.status === "paused" || !isMonitoring;
  const statusLabel = isPrepared ? "Ready to begin" : isMonitoring ? "Active" : "Paused";
  const canEnterFocus = (activeSession.status === "active" || activeSession.status === "paused") && isCameraAllowed;
  const canViewAnalytics = !isPrepared;
  const checkInSummary = formatCheckIn(activeSession.preSessionCheckIn);
  const targetDurationMs = Number.isFinite(activeSession.targetDurationMs) && activeSession.targetDurationMs > 0
    ? activeSession.targetDurationMs
    : null;
  const progressPercent = targetDurationMs ? Math.min((elapsedMs / targetDurationMs) * 100, 100) : null;
  const statusMessage = getFriendlyStudyStatus({ activeSession, isMonitoring, focus, fatigue });

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Study Session</p>
      <h2 className="mt-3 text-2xl font-black text-white">
        {isPrepared ? "Your study task is ready." : isMonitoring ? "Your study session is active." : "Your study session is paused."}
      </h2>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Study task</p>
          <p className="mt-2 text-sm font-bold text-white">{formatTask(activeSession.taskDescription)}</p>
          {checkInSummary && <p className="mt-2 text-xs capitalize text-slate-500">{checkInSummary}</p>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</p>
          <p className="mt-2 text-sm font-bold text-white">{statusLabel}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{statusMessage}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Progress</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${progressPercent ?? 0}%` }}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Elapsed <span className="font-mono font-bold text-cyan-200">{formatted}</span></span>
            <span>Target <span className="font-mono font-bold text-white">{targetDurationMs ? formatElapsedTime(targetDurationMs) : "No target"}</span></span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
        {canEnterFocus && (
          <Link href="/app/focus" className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-center text-sm font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20">
            Enter Focus Space
          </Link>
        )}
        {canViewAnalytics && (
          <Link href="/app/dashboard" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800">
            View Live Analytics
          </Link>
        )}
      </div>
    </section>
  );
}
