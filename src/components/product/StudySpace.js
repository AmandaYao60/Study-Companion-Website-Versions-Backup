"use client";

import React from "react";
import Link from "next/link";
import { useAppState } from "../../context/AppContext";
import CameraFeed from "../CameraFeed";
import DebugPanel from "../DebugPanel";
import SessionSetupForm from "./SessionSetupForm";
import ActiveSessionCard from "./ActiveSessionCard";

const formatStatusValue = (value) => {
  if (!value) return "Idle";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getFriendlyStatus = ({ activeSession, isMonitoring, focus, fatigue }) => {
  if (!activeSession) return "Set up a study task when you are ready.";
  if (activeSession.status === "prepared") return "Your task is ready. Enable the camera to begin monitoring.";
  if (activeSession.status === "paused" || !isMonitoring) return "Your session is paused. Resume when you are ready to continue.";
  if (fatigue >= 70) return "You seem a little tired. It is okay to slow down.";
  if (focus >= 75 && fatigue < 55) return "Deeply focused. Keep this steady rhythm.";
  if (focus < 45) return "Your attention may be drifting. Gently bring it back.";
  return "Your study rhythm is steady. Continue at your own pace.";
};

function ModelStatusPanel({ isCameraAllowed, isAiLoaded, affectModelStatus, onDisableWebcam }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl backdrop-blur-xl">
      <h2 className="text-sm font-bold uppercase tracking-wider text-white">Model Status</h2>
      <div className="mt-4 space-y-3 text-xs text-slate-300">
        <div className="flex items-center justify-between gap-4">
          <span>Camera</span>
          <span className={isCameraAllowed ? "text-emerald-300" : "text-slate-400"}>{isCameraAllowed ? "Enabled" : "Offline"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>MediaPipe</span>
          <span>{isAiLoaded ? "Ready" : "Loading"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>ONNX Affect</span>
          <span>{formatStatusValue(affectModelStatus)}</span>
        </div>
      </div>
      {isCameraAllowed && (
        <button type="button" onClick={onDisableWebcam} className="mt-5 w-full rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-all hover:bg-red-500/20">
          Disable Webcam
        </button>
      )}
    </section>
  );
}

function StudyStatusPanel({ activeSession, isMonitoring, isCameraAllowed, focus, fatigue }) {
  const message = getFriendlyStatus({ activeSession, isMonitoring, focus, fatigue });
  const canEnterFocus = activeSession?.status === "active" && isMonitoring && isCameraAllowed;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Study Status</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{message}</p>
      {canEnterFocus ? (
        <Link href="/app/focus" className="mt-4 inline-flex rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20">
          Enter Focus Space
        </Link>
      ) : activeSession?.status === "prepared" ? (
        <p className="mt-4 text-xs text-slate-500">Enable camera access before entering Focus Space.</p>
      ) : activeSession ? (
        <p className="mt-4 text-xs text-slate-500">Resume monitoring from the global session bar to enter Focus Space.</p>
      ) : (
        <p className="mt-4 text-xs text-slate-500">Set up a study task and enable the camera when you are ready to begin.</p>
      )}
    </section>
  );
}

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
    stopCamera,
  } = useAppState();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,0.38fr)_minmax(0,0.62fr)] lg:items-start">
        <aside className="space-y-6 lg:sticky lg:top-36">
          {activeSession ? <ActiveSessionCard /> : <SessionSetupForm />}
          <ModelStatusPanel
            isCameraAllowed={isCameraAllowed}
            isAiLoaded={isAiLoaded}
            affectModelStatus={affectModelStatus}
            onDisableWebcam={stopCamera}
          />
          <StudyStatusPanel activeSession={activeSession} isMonitoring={isMonitoring} isCameraAllowed={isCameraAllowed} focus={focus} fatigue={fatigue} />
          {isDebugMode && <DebugPanel />}
        </aside>

        <main className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Study Workspace</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Camera and attention monitor</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              Use the session panel to set up your task, then enable the camera when you are ready to begin monitoring.
            </p>
          </div>
          <CameraFeed presentation="monitor" showControls={false} />
        </main>
      </div>
    </div>
  );
}
