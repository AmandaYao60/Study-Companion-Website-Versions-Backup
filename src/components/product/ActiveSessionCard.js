"use client";

import React from "react";
import Link from "next/link";
import { useDebug, useMonitoring, useSession } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTask } from "../dashboard/dashboardFormatters";
import SessionProgress from "../session/SessionProgress";
import { formatSubjectLabel, formatTaskTypeLabel } from "../../services/session/index.js";

const formatRating = (value) => Number.isInteger(value) ? `${value}/5` : null;
const formatCheckIn = (session) => {
  const checkIn = session?.preSessionCheckIn;
  if (!session && !checkIn) return null;
  const details = [];
  if (session.subject) details.push(`Subject: ${session.subject === "other" ? session.customSubject || "Other" : formatSubjectLabel(session.subject)}`);
  if (session.taskType) details.push(`Task type: ${session.taskType === "other" ? session.customTaskType || "Other" : formatTaskTypeLabel(session.taskType)}`);
  if (formatRating(checkIn?.energy)) details.push(`Initial energy: ${formatRating(checkIn.energy)}`);
  if (formatRating(checkIn?.mood)) details.push(`Initial mood: ${formatRating(checkIn.mood)}`);
  return details.length > 0 ? details.join(" / ") : null;
};

const getFriendlyStudyStatus = ({ activeSession, isMonitoring, attention, fatigue }) => {
  if (!activeSession) return "Set up a study task when you are ready.";
  if (activeSession.status === "prepared") return "Your task is ready. Enable the camera to begin monitoring.";
  if (activeSession.status === "paused" || !isMonitoring) return "Monitoring is paused. Resume when you are ready to continue.";
  if (fatigue >= 70) return "You seem a little tired. It is okay to slow down.";
  if (attention >= 75 && fatigue < 55) return "Deeply focused. Keep this steady rhythm.";
  if (attention < 45) return "Your attention may be drifting. Gently bring it back.";
  return "Your study rhythm is steady. Continue at your own pace.";
};

export default function ActiveSessionCard() {
  const { activeSession } = useSession();
  const { isMonitoring, isCameraAllowed } = useMonitoring();
  const { resolvedDebugMetrics } = useDebug();
  const { elapsedMs } = useSmoothSessionTimer(250);

  if (!activeSession) return null;

  const isPrepared = activeSession.status === "prepared";
  const statusLabel = isPrepared ? "Ready to begin" : isMonitoring ? "Active" : "Paused";
  const canEnterFocus = (activeSession.status === "active" || activeSession.status === "paused") && isCameraAllowed;
  const canViewAnalytics = !isPrepared;
  const checkInSummary = formatCheckIn(activeSession);
  const attentionMetric = resolvedDebugMetrics.attention;
  const fatigueMetric = resolvedDebugMetrics.fatigue;
  const hasDebugOverride = attentionMetric.overrideActive || fatigueMetric.overrideActive;
  const statusMessage = getFriendlyStudyStatus({
    activeSession,
    isMonitoring,
    attention: attentionMetric.displayedValue,
    fatigue: fatigueMetric.displayedValue,
  });

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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-white">{statusLabel}</p>
            {hasDebugOverride && (
              <span className="rounded border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                DEBUG OVERRIDE
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{statusMessage}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Progress</p>
          <SessionProgress elapsedMs={elapsedMs} targetDurationMs={activeSession.targetDurationMs} className="mt-3" />
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
