"use client";

import React from "react";
import { formatElapsedTime } from "../../hooks/useSmoothSessionTimer";

export const getSessionProgressPercent = (elapsedMs, targetDurationMs) => {
  const target = Number(targetDurationMs);
  if (!Number.isFinite(target) || target <= 0) return null;
  return Math.min((Math.max(elapsedMs, 0) / target) * 100, 100);
};

export default function SessionProgress({
  elapsedMs,
  targetDurationMs,
  className = "",
  barClassName = "bg-cyan-400",
}) {
  const progressPercent = getSessionProgressPercent(elapsedMs, targetDurationMs);
  const hasTarget = progressPercent !== null;

  return (
    <div className={className}>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${barClassName}`}
          style={{ width: `${progressPercent ?? 0}%` }}
        />
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Elapsed <span className="font-mono font-bold text-cyan-200">{formatElapsedTime(elapsedMs)}</span></span>
        <span>Target <span className="font-mono font-bold text-white">{hasTarget ? formatElapsedTime(targetDurationMs) : "No target"}</span></span>
      </div>
    </div>
  );
}
