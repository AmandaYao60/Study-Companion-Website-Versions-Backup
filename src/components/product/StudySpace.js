"use client";

import React from "react";
import Link from "next/link";
import { useAppState } from "../../context/AppContext";
import CameraFeed from "../CameraFeed";
import DebugPanel from "../DebugPanel";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import { formatTargetDuration, formatTask } from "../dashboard/dashboardFormatters";

const getFriendlyStatus = ({ sessionStatus, isMonitoring, focus, fatigue }) => {
  if (sessionStatus === "prepared") return "Camera access is required to begin monitoring.";
  if (!isMonitoring) return "Monitoring is paused. Resume when you are ready to continue.";
  if (fatigue >= 70) return "You seem a little tired. It is okay to slow down.";
  if (focus >= 75 && fatigue < 55) return "Deeply focused. Keep this steady rhythm.";
  if (focus < 45) return "Your attention may be drifting. Gently bring it back.";
  return "Your study rhythm is steady. Continue at your own pace.";
};

export default function StudySpace() {
  const {
    activeSession,
    isMonitoring,
    isCameraAllowed,
    isAiLoaded,
    affectModelStatus,
    isDebugMode,
    focus,
    fatigue,
    currentGesture,
    stopCamera,
  } = useAppState();
  const { formatted } = useSmoothSessionTimer(250);

  if (!activeSession) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-12 sm:px-6 lg:px-8">
        <section className="w-full rounded-3xl border border-white/10 bg-slate-950/50 p-8 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Study Space</p>
          <h1 className="mt-3 text-3xl font-black text-white">Start a session first.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            Study Space uses the active session task, timer, camera state, and metric sampling. Create a session from Product Home before entering the monitor view.
          </p>
          <Link href="/app" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">
            Go to Session Setup
          </Link>
        </section>
      </div>
    );
  }

  const sessionStatus = activeSession.status;
  const status = getFriendlyStatus({ sessionStatus, isMonitoring, focus, fatigue });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Study Space</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{formatTask(activeSession.taskDescription)}</h1>
          <p className="mt-2 text-sm text-slate-400">Standard monitoring view for your current study session.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Elapsed</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{formatted}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Target</p>
            <p className="mt-1 text-sm font-bold text-white">{formatTargetDuration(activeSession.targetDurationMs)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Monitoring</p>
            <p className={`mt-1 text-sm font-bold ${isMonitoring ? "text-emerald-300" : "text-amber-300"}`}>{sessionStatus === "prepared" ? "Ready to begin" : isMonitoring ? "Active" : "Paused"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Posture</p>
            <p className="mt-1 text-sm font-bold text-white">{currentGesture === "None" ? "Nominal" : currentGesture}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CameraFeed presentation="monitor" showControls={false} />
          <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl backdrop-blur-xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Study status</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{status}</p>
            {isMonitoring ? (
              <Link href="/app/focus" className="mt-4 inline-flex rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20">
                Enter Focus Space
              </Link>
            ) : (
              <p className="mt-4 text-xs text-slate-500">{sessionStatus === "prepared" ? "Enable camera access to begin monitoring before entering Focus Space." : "Resume monitoring from the global session bar to enter Focus Space."}</p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl backdrop-blur-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Model Status</h2>
            <div className="mt-4 space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between"><span>Camera</span><span>{isCameraAllowed ? "Enabled" : "Needs permission"}</span></div>
              <div className="flex items-center justify-between"><span>MediaPipe</span><span>{isAiLoaded ? "Ready" : "Loading"}</span></div>
              <div className="flex items-center justify-between"><span>ONNX Affect</span><span className="capitalize">{affectModelStatus}</span></div>
            </div>
            <button type="button" onClick={stopCamera} disabled={!isCameraAllowed} className="mt-5 w-full rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900 disabled:text-slate-600">
              Disable Webcam
            </button>
          </section>

          {isDebugMode ? (
            <DebugPanel />
          ) : (
            <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl backdrop-blur-xl">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Session Notes</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Technical debug details are available when Debug Mode is enabled. The normal Study Space keeps camera, model, and session status easy to scan.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
