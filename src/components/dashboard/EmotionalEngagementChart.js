"use client";

import React, { useMemo, useState } from "react";
import {
  CIRCUMPLEX_REFERENCE_REGIONS,
  selectEmotionalMeanPoint,
  selectEmotionalTrajectory,
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
const abbreviate = (label) => label.length > 8 ? label.slice(0, 4) : label;

const scaleX = (value) => padding.left + ((clamp(value, -1, 1) + 1) / 2) * plotWidth;
const scaleY = (value) => padding.top + (1 - (clamp(value, -1, 1) + 1) / 2) * plotHeight;
const trajectoryPath = (points) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${scaleX(point.valence)} ${scaleY(point.arousal)}`).join(" ");

export default function EmotionalEngagementChart({ samples = [], mode = "live" }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const trajectory = useMemo(() => selectEmotionalTrajectory(samples), [samples]);
  const meanPoint = useMemo(() => selectEmotionalMeanPoint(samples), [samples]);
  const hasTrajectory = trajectory.length > 0;
  const finalPoint = trajectory[trajectory.length - 1] || null;
  const startPoint = trajectory[0] || null;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Emotional Engagement</h2>
          <p className="mt-1 text-xs text-slate-500">Valence-arousal trajectory across the study session</p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-400">
          {mode === "live" ? "Live" : "Historical"}
        </span>
      </div>

      <div className="relative mt-5 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
        {!hasTrajectory ? (
          <div className="flex min-h-80 items-center justify-center p-6 text-center text-sm text-slate-400">
            No valid valence-arousal samples are available yet. Missing affect values are not plotted as zero.
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Valence arousal trajectory chart">
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

            {CIRCUMPLEX_REFERENCE_REGIONS.map((region) => (
              <g key={region.id}>
                <ellipse
                  cx={scaleX(region.valence)}
                  cy={scaleY(region.arousal)}
                  rx={(region.regionRadiusX / 2) * plotWidth}
                  ry={(region.regionRadiusY / 2) * plotHeight}
                  fill="rgba(34,211,238,0.055)"
                  stroke="rgba(34,211,238,0.16)"
                />
                <text x={scaleX(region.valence)} y={scaleY(region.arousal) + 3} textAnchor="middle" className="fill-cyan-200/70 text-[9px] font-semibold">
                  {abbreviate(region.label)}
                </text>
              </g>
            ))}

            {trajectory.length > 1 && (
              <path d={trajectoryPath(trajectory)} fill="none" stroke="rgba(16,185,129,0.85)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            )}

            {trajectory.map((point, index) => {
              const x = scaleX(point.valence);
              const y = scaleY(point.arousal);
              const opacity = 0.3 + ((index + 1) / trajectory.length) * 0.65;
              return (
                <circle
                  key={point.id || index}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#34d399"
                  opacity={opacity}
                  onMouseEnter={() => setHoveredPoint({ ...point, x, y })}
                  onFocus={() => setHoveredPoint({ ...point, x, y })}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onBlur={() => setHoveredPoint(null)}
                  tabIndex={0}
                  aria-label={`Affect sample at ${formatDuration(point.elapsedMs)}`}
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
        )}

        {hoveredPoint && (
          <ChartTooltip x={(hoveredPoint.x / width) * 100 + "%"} y={(hoveredPoint.y / height) * 100 + "%"}>
            <div className="space-y-1">
              <p className="font-bold text-white">{formatDuration(hoveredPoint.elapsedMs)}</p>
              <p>Valence: {formatMetricValue(hoveredPoint.valence, "affect")}</p>
              <p>Arousal: {formatMetricValue(hoveredPoint.arousal, "affect")}</p>
              <p>Emotion: {hoveredPoint.emotion || "Unavailable"}</p>
              <p>Confidence: {isFiniteNumber(hoveredPoint.emotionConfidence) ? hoveredPoint.emotionConfidence.toFixed(2) : "Unavailable"}</p>
              <p>Data quality: {hoveredPoint.dataQuality || "Unavailable"}</p>
            </div>
          </ChartTooltip>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />Start</span>
        <span><span className="mr-1 inline-block h-2 w-2 rotate-45 bg-amber-300" />Current/final</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-pink-400" />Mean</span>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Emotion regions are illustrative reference areas, not diagnostic boundaries.
      </p>
    </section>
  );
}
