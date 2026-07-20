"use client";

import React from "react";
import { useAppState } from "../../context/AppContext";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";

export default function FocusSessionControls({
  isFullscreen,
  isFullscreenSupported,
  onToggleFullscreen,
}) {
  const { isMonitoring, isCameraAllowed, setShowCameraDialog, toggleMonitoring } = useAppState();
  const { formatted, minuteProgress } = useSmoothSessionTimer(250);

  const handleSessionClick = () => {
    if (!isCameraAllowed) {
      setShowCameraDialog(true);
      return;
    }

    void toggleMonitoring();
  };

  return (
    <div className="absolute left-4 right-4 top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 backdrop-blur-xl sm:left-6 sm:right-6">
      <div className="min-w-[9rem]">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">Focus Session</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-white">{formatted}</span>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${minuteProgress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSessionClick}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            isMonitoring
              ? "border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "bg-cyan-500 text-slate-950 hover:bg-cyan-300"
          }`}
        >
          {isMonitoring ? "Pause" : isCameraAllowed ? "Start" : "Enable Camera"}
        </button>

        {isFullscreenSupported && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800"
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        )}
      </div>
    </div>
  );
}