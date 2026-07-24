"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";
import CameraFeed from "../CameraFeed";
import SessionSetupForm from "./SessionSetupForm";
import ActiveSessionCard from "./ActiveSessionCard";
import EndSessionDialog from "./EndSessionDialog";
import PostSessionReflectionDialog from "./PostSessionReflectionDialog";

const formatStatusValue = (value) => {
  if (!value) return "Idle";
  return value.charAt(0).toUpperCase() + value.slice(1);
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

export default function StudySpace() {
  const router = useRouter();
  const {
    activeSession,
    isMonitoring,
    isCameraAllowed,
    isAiLoaded,
    affectModelStatus,
    pauseSession,
    resumeSession,
    finishSession,
    discardSession,
    stopCamera,
    addLog,
  } = useAppState();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReflectionOpen, setIsReflectionOpen] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isCompletingReflection, setIsCompletingReflection] = useState(false);

  const hasActivatedSession = activeSession && activeSession.status !== "prepared";
  const isSessionActive = activeSession?.status === "active";

  const handleDisableWebcam = async () => {
    try {
      await stopCamera();
    } catch (error) {
      console.error("Failed to disable webcam:", error);
      addLog("Could not disable the webcam cleanly. Local storage may be unavailable.", "error");
    }
  };

  const handlePauseResume = async () => {
    if (!hasActivatedSession) return;
    setIsToggling(true);
    try {
      if (isMonitoring) {
        await pauseSession();
      } else if (isSessionActive) {
        await pauseSession();
      } else {
        await resumeSession();
      }
    } catch (error) {
      console.error("Failed to toggle study session:", error);
      addLog("Could not update the study session state. Local storage may be unavailable.", "error");
    } finally {
      setIsToggling(false);
    }
  };

  const handleEnd = async () => {
    setIsEnding(true);
    try {
      if (activeSession?.status === "active" || isMonitoring) {
        await pauseSession({ silent: true });
      }
      setIsDialogOpen(false);
      setIsReflectionOpen(true);
    } catch (error) {
      console.error("Failed to pause before reflection:", error);
      addLog("Could not pause the study session before reflection. Please try again.", "error");
    } finally {
      setIsEnding(false);
    }
  };

  const handleSaveReflection = async (postSessionCheckOut) => {
    if (isCompletingReflection) return;
    setIsCompletingReflection(true);
    try {
      const completed = await finishSession({ postSessionCheckOut });
      setIsReflectionOpen(false);
      router.push(completed ? "/app/dashboard" : "/app");
    } catch (error) {
      console.error("Failed to finish study session:", error);
      addLog("Could not finish and save the study session. Please try again.", "error");
    } finally {
      setIsCompletingReflection(false);
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm("Discard this active session? Collected samples for it will be deleted.")) return;
    setIsEnding(true);
    try {
      await discardSession();
      setIsDialogOpen(false);
      router.push("/app");
    } catch (error) {
      console.error("Failed to discard study session:", error);
      addLog("Could not discard the study session. Local storage may be unavailable.", "error");
    } finally {
      setIsEnding(false);
    }
  };

  if (!activeSession) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-3xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <SessionSetupForm />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,0.38fr)_minmax(0,0.62fr)] lg:items-start">
        <aside className="space-y-6 lg:sticky lg:top-36">
          <ActiveSessionCard />
          <ModelStatusPanel
            isCameraAllowed={isCameraAllowed}
            isAiLoaded={isAiLoaded}
            affectModelStatus={affectModelStatus}
            onDisableWebcam={() => void handleDisableWebcam()}
          />
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
          {hasActivatedSession && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handlePauseResume()}
                disabled={isToggling}
                className={`rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:cursor-wait disabled:opacity-70 ${
                  isMonitoring || isSessionActive
                    ? "border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                    : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                }`}
              >
                {isMonitoring || isSessionActive
                  ? "Pause Session"
                  : isToggling
                    ? "Resuming..."
                    : "Resume Session"}
              </button>
              <button
                type="button"
                onClick={() => setIsDialogOpen(true)}
                className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200 transition-all hover:bg-emerald-400/20"
              >
                End Session
              </button>
            </div>
          )}
        </main>
      </div>
      <EndSessionDialog open={isDialogOpen} isEnding={isEnding} onClose={() => setIsDialogOpen(false)} onConfirm={() => void handleEnd()} onDiscard={() => void handleDiscard()} />
      <PostSessionReflectionDialog
        open={isReflectionOpen}
        session={activeSession}
        isSaving={isCompletingReflection}
        onCancel={() => setIsReflectionOpen(false)}
        onSave={(postSessionCheckOut) => void handleSaveReflection(postSessionCheckOut)}
      />
    </div>
  );
}
