"use client";

import React from "react";
import { formatMetricUnit, formatMetricValue } from "./dashboardFormatters";

const colorByMetric = {
  attention: "text-cyan-300 border-cyan-400/15 bg-cyan-400/[0.06]",
  fatigue: "text-rose-300 border-rose-400/15 bg-rose-400/[0.06]",
  valence: "text-emerald-300 border-emerald-400/15 bg-emerald-400/[0.06]",
  arousal: "text-amber-300 border-amber-400/15 bg-amber-400/[0.06]",
};

export default function DashboardMetricCards({ cards = [], sourceLabel }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const currentDisplay = formatMetricValue(card.currentValue, card.valueKind);
        const averageDisplay = formatMetricValue(card.averageValue, card.valueKind);
        const unit = formatMetricUnit(card.valueKind);
        const colorClass = colorByMetric[card.id] || "text-slate-300 border-white/10 bg-white/[0.04]";

        return (
          <article key={card.id} className={`rounded-2xl border p-4 shadow-xl backdrop-blur-xl ${colorClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">Range: {card.rangeLabel}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-slate-950/50 px-2 py-1 text-[10px] font-semibold text-slate-400">
                {card.dataQuality || "No data"}
              </span>
            </div>

            <div className="mt-4">
              <span className="text-3xl font-black text-white">
                {currentDisplay}{currentDisplay !== "Unavailable" ? unit : ""}
              </span>
              <p className="mt-1 text-[11px] text-slate-400">
                {sourceLabel === "Active Session" ? "Current value" : "Latest available value"}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Average</p>
                <p className="mt-1 font-semibold text-slate-100">
                  {averageDisplay}{averageDisplay !== "Unavailable" ? unit : ""}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Trend</p>
                <p className="mt-1 font-semibold capitalize text-slate-100">{card.trend || "insufficient"}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
