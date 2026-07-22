"use client";

import React from "react";
import { formatMetricUnit, formatMetricValue } from "./dashboardFormatters";
import { getMetricPresentation, UNAVAILABLE_VALUE } from "./metricPresentation";

const trendIconByValue = {
  increasing: { label: "Increasing trend", title: "Increasing" },
  decreasing: { label: "Decreasing trend", title: "Decreasing" },
  stable: { label: "Stable trend", title: "Stable" },
  insufficient: { label: "Insufficient trend data", title: "Insufficient" },
};

const formatDisplay = (value, valueKind) => {
  const display = formatMetricValue(value, valueKind);
  if (display === "Unavailable") return UNAVAILABLE_VALUE;
  return `${display}${formatMetricUnit(valueKind)}`;
};

function TrendIcon({ trend }) {
  const iconProps = {
    className: "h-8 w-8",
    viewBox: "0 0 32 32",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true",
  };

  if (trend === "increasing") {
    return (
      <svg {...iconProps}>
        <path d="M8 22L21.5 8.5" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M13 8H22.5V17.5" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 24.5H24.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      </svg>
    );
  }

  if (trend === "decreasing") {
    return (
      <svg {...iconProps}>
        <path d="M8 10L21.5 23.5" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M13 24H22.5V14.5" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 7.5H24.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      </svg>
    );
  }

  if (trend === "stable") {
    return (
      <svg {...iconProps}>
        <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="3.4" />
        <circle cx="16" cy="16" r="3.4" fill="currentColor" opacity="0.55" />
      </svg>
    );
  }

  return (
    <svg {...iconProps}>
      <path d="M9 16H23" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2.4" opacity="0.45" />
    </svg>
  );
}

export default function DashboardMetricCards({ cards = [] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const currentDisplay = formatDisplay(card.currentValue, card.valueKind);
        const averageDisplay = formatDisplay(card.averageValue, card.valueKind);
        const colors = getMetricPresentation(card.id);
        const trend = trendIconByValue[card.trend] || trendIconByValue.insufficient;

        return (
          <article key={card.id} className={`rounded-2xl border p-4 shadow-xl backdrop-blur-xl ${colors.card}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className={`text-xl font-black tracking-tight ${colors.title}`}>{card.label}</h3>
              <span className="rounded-full border border-white/10 bg-slate-950/50 px-2 py-1 text-[10px] font-semibold text-slate-400">
                {card.dataQuality || "No data"}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
              <div className="min-w-0 self-center">
                <p className="truncate text-4xl font-black tracking-tight text-white">{currentDisplay}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">Range: {card.rangeLabel}</p>
              </div>

              <span
                role="img"
                aria-label={trend.label}
                title={trend.title}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${colors.icon}`}
              >
                <TrendIcon trend={card.trend} />
              </span>

              <div className="flex min-h-20 min-w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-slate-950/35 px-3 py-3 text-center">
                <p className={`text-2xl font-black tracking-tight ${colors.average}`}>{averageDisplay}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Average</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
