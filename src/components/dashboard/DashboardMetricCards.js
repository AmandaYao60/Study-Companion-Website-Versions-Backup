"use client";

import React from "react";
import { formatMetricUnit, formatMetricValue } from "./dashboardFormatters";

const colorByMetric = {
  attention: {
    card: "border-cyan-400/15 bg-cyan-400/[0.06]",
    title: "text-cyan-300",
  },
  fatigue: {
    card: "border-rose-400/15 bg-rose-400/[0.06]",
    title: "text-rose-300",
  },
  valence: {
    card: "border-emerald-400/15 bg-emerald-400/[0.06]",
    title: "text-emerald-300",
  },
  arousal: {
    card: "border-amber-400/15 bg-amber-400/[0.06]",
    title: "text-amber-300",
  },
};

const trendIconByValue = {
  increasing: { symbol: "↑", label: "Increasing trend", title: "Increasing" },
  decreasing: { symbol: "↓", label: "Decreasing trend", title: "Decreasing" },
  stable: { symbol: "○", label: "Stable trend", title: "Stable" },
  insufficient: { symbol: "–", label: "Insufficient trend data", title: "Insufficient" },
};

const formatDisplay = (value, valueKind) => {
  const display = formatMetricValue(value, valueKind);
  if (display === "Unavailable") return "—";
  return `${display}${formatMetricUnit(valueKind)}`;
};

export default function DashboardMetricCards({ cards = [] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const currentDisplay = formatDisplay(card.currentValue, card.valueKind);
        const averageDisplay = formatDisplay(card.averageValue, card.valueKind);
        const colors = colorByMetric[card.id] || { card: "border-white/10 bg-white/[0.04]", title: "text-slate-200" };
        const trend = trendIconByValue[card.trend] || trendIconByValue.insufficient;

        return (
          <article key={card.id} className={`rounded-2xl border p-4 shadow-xl backdrop-blur-xl ${colors.card}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className={`text-xl font-black tracking-tight ${colors.title}`}>{card.label}</h3>
              <span className="rounded-full border border-white/10 bg-slate-950/50 px-2 py-1 text-[10px] font-semibold text-slate-400">
                {card.dataQuality || "No data"}
              </span>
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black tracking-tight text-white">{currentDisplay}</span>
                  <span aria-label={trend.label} title={trend.title} className="text-2xl font-black text-slate-300">
                    {trend.symbol}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">Range: {card.rangeLabel}</p>
              </div>

              <div className="flex min-h-20 min-w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 text-center">
                <p className="text-2xl font-black tracking-tight text-slate-200">{averageDisplay}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Average</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
