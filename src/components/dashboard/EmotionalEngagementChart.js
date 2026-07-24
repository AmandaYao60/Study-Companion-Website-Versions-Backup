"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  selectEmotionalMeanPoint,
  selectEmotionalTrajectory,
  selectExpressionIntervalDistribution,
} from "../../services/session/index.js";
import ChartTooltip from "./ChartTooltip";
import { formatDuration, formatMetricValue } from "./dashboardFormatters";

const width = 520;
const height = 360;
const padding = { top: 30, right: 30, bottom: 42, left: 48 };
const plotWidth = width - padding.left - padding.right;
const plotHeight = height - padding.top - padding.bottom;
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scaleX = (value) => padding.left + ((clamp(value, -1, 1) + 1) / 2) * plotWidth;
const scaleY = (value) => padding.top + (1 - (clamp(value, -1, 1) + 1) / 2) * plotHeight;
const trajectoryPath = (points) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${scaleX(point.valence)} ${scaleY(point.arousal)}`).join(" ");
const formatProbability = (value) => isFiniteNumber(value) ? `${Math.round(value * 100)}%` : null;
const chartModeLabel = (viewState, mode) => {
  if (viewState === "active" || mode === "live") return "Live";
  if (viewState === "paused") return "Paused";
  if (viewState === "end") return "End Session";
  return "Historical";
};

function ValenceArousalPlot({ trajectory, meanPoint, interactive = false, label = "Valence arousal trajectory chart" }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const hasTrajectory = trajectory.length > 0;
  const finalPoint = trajectory[trajectory.length - 1] || null;
  const startPoint = trajectory[0] || null;

  if (!hasTrajectory) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">
        No valid valence-arousal samples are available yet. Missing affect values are not plotted as zero.
      </div>
    );
  }

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={label}>
        <defs>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x={padding.left} y={padding.top} width={plotWidth / 2} height={plotHeight / 2} fill="rgba(248,113,113,0.045)" />
        <rect x={padding.left + plotWidth / 2} y={padding.top} width={plotWidth / 2} height={plotHeight / 2} fill="rgba(250,204,21,0.045)" />
        <rect x={padding.left} y={padding.top + plotHeight / 2} width={plotWidth / 2} height={plotHeight / 2} fill="rgba(96,165,250,0.045)" />
        <rect x={padding.left + plotWidth / 2} y={padding.top + plotHeight / 2} width={plotWidth / 2} height={plotHeight / 2} fill="rgba(52,211,153,0.045)" />

        {[-1, -0.5, 0, 0.5, 1].map((tick) => (
          <g key={`grid-${tick}`}>
            <line x1={scaleX(tick)} x2={scaleX(tick)} y1={padding.top} y2={height - padding.bottom} stroke="rgba(148,163,184,0.1)" />
            <line x1={padding.left} x2={width - padding.right} y1={scaleY(tick)} y2={scaleY(tick)} stroke="rgba(148,163,184,0.1)" />
            <text x={scaleX(tick)} y={height - 16} textAnchor="middle" className="fill-slate-500 text-[10px]">{tick}</text>
            <text x={padding.left - 12} y={scaleY(tick) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{tick}</text>
          </g>
        ))}

        <line x1={scaleX(0)} x2={scaleX(0)} y1={padding.top} y2={height - padding.bottom} stroke="rgba(226,232,240,0.35)" />
        <line x1={padding.left} x2={width - padding.right} y1={scaleY(0)} y2={scaleY(0)} stroke="rgba(226,232,240,0.35)" />
        <text x={width / 2} y={height - 2} textAnchor="middle" className="fill-slate-400 text-[11px]">Valence</text>
        <text x="14" y={height / 2} textAnchor="middle" transform={`rotate(-90 14 ${height / 2})`} className="fill-slate-400 text-[11px]">Arousal</text>

        {trajectory.length > 1 && (
          <path d={trajectoryPath(trajectory)} fill="none" stroke="rgba(16,185,129,0.85)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {trajectory.map((point, index) => {
          const x = scaleX(point.valence);
          const y = scaleY(point.arousal);
          const opacity = 0.3 + ((index + 1) / trajectory.length) * 0.65;
          const eventProps = interactive
            ? {
              onMouseEnter: () => setHoveredPoint({ ...point, x, y }),
              onFocus: () => setHoveredPoint({ ...point, x, y }),
              onMouseLeave: () => setHoveredPoint(null),
              onBlur: () => setHoveredPoint(null),
              tabIndex: 0,
              "aria-label": `Affect sample at ${formatDuration(point.elapsedMs)}`,
              className: "cursor-crosshair outline-none focus:ring-2 focus:ring-cyan-300",
            }
            : { "aria-hidden": true };

          return (
            <circle
              key={point.id || index}
              cx={x}
              cy={y}
              r={interactive ? "5" : "4"}
              fill="#34d399"
              opacity={opacity}
              {...eventProps}
            />
          );
        })}

        {startPoint && (
          <circle cx={scaleX(startPoint.valence)} cy={scaleY(startPoint.arousal)} r="7" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="2" filter="url(#softGlow)" />
        )}
        {finalPoint && (
          <path
            d={`M ${scaleX(finalPoint.valence) - 7} ${scaleY(finalPoint.arousal)} L ${scaleX(finalPoint.valence)} ${scaleY(finalPoint.arousal) - 9} L ${scaleX(finalPoint.valence) + 7} ${scaleY(finalPoint.arousal)} L ${scaleX(finalPoint.valence)} ${scaleY(finalPoint.arousal) + 9} Z`}
            fill="#fbbf24"
            stroke="#fef3c7"
            strokeWidth="1.5"
            filter="url(#softGlow)"
          />
        )}
        {meanPoint && (
          <g>
            <line x1={scaleX(meanPoint.valence) - 8} x2={scaleX(meanPoint.valence) + 8} y1={scaleY(meanPoint.arousal)} y2={scaleY(meanPoint.arousal)} stroke="#f472b6" strokeWidth="2" />
            <line x1={scaleX(meanPoint.valence)} x2={scaleX(meanPoint.valence)} y1={scaleY(meanPoint.arousal) - 8} y2={scaleY(meanPoint.arousal) + 8} stroke="#f472b6" strokeWidth="2" />
          </g>
        )}
      </svg>

      {interactive && hoveredPoint && (
        <ChartTooltip x={(hoveredPoint.x / width) * 100 + "%"} y={(hoveredPoint.y / height) * 100 + "%"}>
          <div className="space-y-1">
            <p className="font-bold text-white">{formatDuration(hoveredPoint.elapsedMs)}</p>
            <p>Valence: {formatMetricValue(hoveredPoint.valence, "affect")}</p>
            <p>Arousal: {formatMetricValue(hoveredPoint.arousal, "affect")}</p>
            {hoveredPoint.emotion && <p>Top expression: {hoveredPoint.emotion}</p>}
            {isFiniteNumber(hoveredPoint.emotionConfidence) && (
              <p>Top probability: {formatProbability(hoveredPoint.emotionConfidence)}</p>
            )}
            <p>Data quality: {hoveredPoint.dataQuality || "Unavailable"}</p>
          </div>
        </ChartTooltip>
      )}
    </>
  );
}

function ExpressionDistributionChart({ distribution }) {
  if (!distribution || distribution.total === 0) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-center text-sm text-slate-400">
        No valid classified affect intervals are available. Missing, invalid, or unclassified intervals are excluded.
      </div>
    );
  }

  return (
    <div className="space-y-3 md:grid md:h-full md:grid-rows-[repeat(8,minmax(0,1fr))] md:gap-2 md:space-y-0">
      {distribution.items.map((item) => {
        const percent = Math.round(item.percentage * 100);
        const intervalLabel = `${item.count} interval${item.count === 1 ? "" : "s"}`;
        return (
          <div key={item.label} className="grid min-h-12 grid-cols-[5.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 rounded-lg px-2 py-2 text-xs md:min-h-0">
            <span className="truncate font-semibold text-slate-300">{item.label}</span>
            <div className="h-4 overflow-hidden rounded-full bg-white/[0.02]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-right font-mono text-slate-300">{percent}% · {intervalLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function EmotionalEngagementDialog({ open, onClose, trajectory, meanPoint, distribution }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="emotional-engagement-dialog-title"
        className="grid h-[92dvh] max-h-[92dvh] w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-4 text-white shadow-2xl sm:p-5"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="emotional-engagement-dialog-title" className="text-[18px] font-bold uppercase tracking-[0.24em]"> Emotional Engagement: </h2>
            <p className="text-[18px] font-bold uppercase tracking-[0.24em] text-emerald-300"> Expanded Analysis </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 items-stretch gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.95fr)]">
          <section className="flex h-full min-h-0 flex-col"> 
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white"> Valence-Arousal Trajectory </h3>
              <p className="mt-1 text-[11px] text-slate-500"> Place the mouse cursor on any green point to view the detailed data </p>
              <div className="mt-2 flex min-h-0 flex-1 items-center justify-center">
                <div className="aspect-[13/7] h-full max-h-full max-w-full">
                  <ValenceArousalPlot trajectory={trajectory} meanPoint={meanPoint} interactive label="Expanded valence arousal trajectory chart"/>
                </div>
              </div> 
            </div>
            
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] font-semibold text-slate-500">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />Start</span>
              <span><span className="mr-1 inline-block h-2 w-2 rotate-45 bg-amber-300" />Current/final</span>
              <span><span className="mr-1 inline-block h-2 w-2 bg-pink-400" />Mean</span>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
              VA coordinates are continuous. Discrete expressions come only from the stored classifier output for each interval.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
              The circumplex model maps affect across two dimensions: valence describes how pleasant or unpleasant a state is, while arousal describes its level of activation or energy.
            </p>
            
          </section>
          <section className="flex h-full min-h-0 flex-col rounded-xl border border-white/10 bg-slate-900/35 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white"> Expression Interval Distribution </h3>
            <p className="mt-1 text-[11px] text-slate-500"> Proportion of valid affect intervals classified as each expression. </p>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 md:overflow-hidden">
              <ExpressionDistributionChart distribution={distribution} />
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default function EmotionalEngagementChart({
  samples = [],
  mode = "live",
  viewState,
  allowExpandedAnalysis = false,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const trajectory = useMemo(() => selectEmotionalTrajectory(samples), [samples]);
  const meanPoint = useMemo(() => selectEmotionalMeanPoint(samples), [samples]);
  const distribution = useMemo(() => selectExpressionIntervalDistribution(samples), [samples]);
  const closeExpandedDialog = useCallback(() => setIsExpanded(false), []);
  const resolvedViewState = viewState || (mode === "live" ? "active" : "historical");
  const canExpand = allowExpandedAnalysis && ["active", "paused", "end"].includes(resolvedViewState);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Emotional Engagement</h2>
          <p className="mt-1 text-xs text-slate-500">Continuous valence-arousal trajectory </p>
        </div>
        <div className="shrink-0">
          <span className="inline-block whitespace-nowrap rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-center text-[10px] font-semibold text-slate-400">
            {chartModeLabel(resolvedViewState, mode)}
          </span>
        </div>
      </div>

      <div className="relative mt-5 flex min-h-[360px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
        {canExpand && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="absolute right-3 top-3 z-10 whitespace-nowrap rounded-full border border-emerald-400/30 bg-slate-950/80 px-3 py-1.5 text-[10px] font-semibold text-emerald-200 shadow-lg backdrop-blur-md transition-all hover:border-emerald-400/50 hover:bg-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          >
            Expand Analysis
          </button>
        )}
        <ValenceArousalPlot trajectory={trajectory} meanPoint={meanPoint} interactive={false} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />Start</span>
        <span><span className="mr-1 inline-block h-2 w-2 rotate-45 bg-amber-300" />Current/final</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-pink-400" />Mean</span>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        VA coordinates are continuous. Discrete expressions come only from the stored classifier output for each interval.
      </p>

      <EmotionalEngagementDialog
        open={isExpanded && canExpand}
        onClose={closeExpandedDialog}
        trajectory={trajectory}
        meanPoint={meanPoint}
        distribution={distribution}
      />
    </section>
  );
}
