"use client";

import React from "react";

export default function ChartTooltip({ x = 0, y = 0, children }) {
  if (!children) return null;

  return (
    <div
      className="pointer-events-none absolute z-20 min-w-44 rounded-xl border border-white/10 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur-xl"
      style={{ left: x, top: y, transform: "translate(-50%, calc(-100% - 12px))" }}
    >
      {children}
    </div>
  );
}
