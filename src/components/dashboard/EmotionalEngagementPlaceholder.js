"use client";

import React from "react";

export default function EmotionalEngagementPlaceholder({ trajectory = [], sourceLabel }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Emotional Engagement</h2>
          <p className="mt-1 text-xs text-slate-500">Valence-arousal trajectory across the study session</p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-400">
          {trajectory.length} affect samples
        </span>
      </div>
      <div className="mt-5 flex min-h-56 items-center justify-center rounded-xl border border-dashed border-emerald-400/20 bg-emerald-400/[0.03] p-6 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-200">Chart placeholder connected to {sourceLabel.toLowerCase()} affect data.</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Phase 4 will render the valence-arousal path. Missing affect values remain unavailable, not zero.
          </p>
        </div>
      </div>
    </section>
  );
}
