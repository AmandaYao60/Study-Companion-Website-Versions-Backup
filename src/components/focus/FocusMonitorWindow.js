"use client";

import React from "react";
import Link from "next/link";
import CameraFeed from "../CameraFeed";
import { useAppState } from "../../context/AppContext";
import useDraggablePanel from "../../hooks/useDraggablePanel";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";
import SessionProgress from "../session/SessionProgress";

const FOCUS_MONITOR_TOP_CLEARANCE = 124;

const getStudyStatusText = (focus, fatigue) => {
  if (fatigue >= 70) {
    return "You seem a little tired. It is okay to slow down.";
  }

  if (focus >= 75 && fatigue < 55) {
    return "Deeply focused. Keep this steady rhythm.";
  }

  if (focus < 45) {
    return "Your attention may be drifting. Gently bring it back.";
  }

  return "Your study rhythm is steady. Continue at your own pace.";
};

export default function FocusMonitorWindow({ stageRef, onHide }) {
  const { focus, fatigue, activeSession, isMonitoring } = useAppState();
  const { elapsedMs, formatted } = useSmoothSessionTimer(200);
  const {
    panelRef,
    panelStyle,
    dragHandleProps,
    isCompact,
    isDragging,
  } = useDraggablePanel(stageRef, { topClearance: FOCUS_MONITOR_TOP_CLEARANCE });

  const statusText = isMonitoring ? getStudyStatusText(focus, fatigue) : "Monitoring is paused. Resume when you are ready to continue.";

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      className={isCompact
        ? "absolute inset-x-3 bottom-3 z-30 max-h-[82vh] overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/95 shadow-2xl backdrop-blur-xl"
        : "absolute left-0 top-0 z-30 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/92 shadow-2xl backdrop-blur-xl"
      }
    >
      <div
        className={`flex cursor-grab items-center justify-between border-b border-white/10 px-4 py-3 ${isDragging ? "cursor-grabbing" : ""}`}
        {...dragHandleProps}
      >
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-cyan-300">Live Monitor</p>
          <p className="mt-0.5 font-mono text-lg font-black text-white">{formatted}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-no-drag="true"
            onClick={onHide}
            className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition-all hover:bg-slate-800"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 px-3 py-3">
        <SessionProgress elapsedMs={elapsedMs} targetDurationMs={activeSession?.targetDurationMs} />
      </div>

      <div className="space-y-3 p-3">
        <CameraFeed presentation="focus-panel" showControls={false} />

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">Current Task</p>
          <p className="mt-1 text-xs text-slate-300">{activeSession?.taskDescription || "Task setup will be added in a later UI phase."}</p>
        </div>

        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300">Study Status</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-100">{statusText}</p>
        </div>

        <Link
          href="/app"
          data-no-drag="true"
          className="flex w-full items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition-all hover:bg-cyan-400/20"
        >
          Return to Study Space
        </Link>
      </div>
    </div>
  );
}
