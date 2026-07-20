"use client";

import React, { useMemo, useState } from "react";
import { selectBehavioralTimeline, selectMetricAverages } from "../../services/session/index.js";
import ChartTooltip from "./ChartTooltip";
import { formatDuration, formatMetricValue } from "./dashboardFormatters";

const width = 680;
const height = 320;
const padding = { top: 28, right: 24, bottom: 42, left: 48 };
const plotWidth = width - padding.left - padding.right;
const plotHeight = height - padding.top - padding.bottom;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildSegments = (timeline, key, xScale, yScale) => {
  const segments = [];
  let current = [];

  timeline.forEach((point) => {
    if (!isFiniteNumber(point[key])) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }

    current.push({ ...point, x: xScale(point.elapsedMs), y: yScale(point[key]) });
  });

  if (current.length > 0) segments.push(current);
  return segments;
};

const segmentToPath = (segment) => {
  if (segment.length === 0) return "";
  if (segment.length === 1) return `M ${segment[0].x} ${segment[0].y}`;
  return segment.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
};

export default function BehavioralEngagementChart({ samples = [], mode = "live" }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const timeline = useMemo(() => selectBehavioralTimeline(samples), [samples]);
  const averages = useMemo(() => selectMetricAverages(samples), [samples]);
  const maxElapsed = Math.max(...timeline.map((point) => point.elapsedMs || 0), 1);
  const hasAnyValue = timeline.some((point) => isFiniteNumber(point.attention) || isFiniteNumber(point.fatigue));
  const hasEnoughData = timeline.length > 1 && hasAnyValue;

  const xScale = (elapsedMs) => padding.left + (clamp(elapsedMs || 0, 0, maxElapsed) / maxElapsed) * plotWidth;
  const yScale = (value) => padding.top + (1 - clamp(value, 0, 100) / 100) * plotHeight;
  const attentionSegments = buildSegments(timeline, "attention", xScale, yScale);
  const fatigueSegments = buildSegments(timeline, "fatigue", xScale, yScale);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxElapsed * ratio));
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Behavioral Engagement</h2>
          <p className="mt-1 text-xs text-slate-500">Attention and fatigue across the study session</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-cyan-400" /> Attention</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-rose-400" /> Fatigue</span>
          <span className="rounded-full border border-white/10 bg-slate-900 px-2 py-1">{mode === "live" ? "Live" : "Historical"}</span>
        </div>
      </div>

      <div className="relative mt-5 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
        {!hasAnyValue ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center text-sm text-slate-400">
            No behavioral samples are available yet. Start monitoring to collect attention and fatigue intervals.
          </div>
        ) : !hasEnoughData ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center text-sm text-slate-400">
            Waiting for another sample to draw the session line. Missing values are not filled with zero.
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Attention and fatigue line chart">
            <rect x="0" y="0" width={width} height={height} fill="transparent" />
            {yTicks.map((tick) => {
              const y = yScale(tick);
              return (
                <g key={tick}>
                  <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(148,163,184,0.12)" />
                  <text x={padding.left - 12} y={y + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{tick}</text>
                </g>
              );
            })}

            {xTicks.map((tick) => {
              const x = xScale(tick);
              return (
                <g key={tick}>
                  <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke="rgba(148,163,184,0.07)" />
                  <text x={x} y={height - 16} textAnchor="middle" className="fill-slate-500 text-[10px]">{formatDuration(tick)}</text>
                </g>
              );
            })}

            {isFiniteNumber(averages.attention) && (
              <line x1={padding.left} x2={width - padding.right} y1={yScale(averages.attention)} y2={yScale(averages.attention)} stroke="rgba(34,211,238,0.35)" strokeDasharray="5 5" />
            )}
            {isFiniteNumber(averages.fatigue) && (
              <line x1={padding.left} x2={width - padding.right} y1={yScale(averages.fatigue)} y2={yScale(averages.fatigue)} stroke="rgba(251,113,133,0.35)" strokeDasharray="5 5" />
            )}

            {attentionSegments.map((segment, index) => (
              <path key={`attention-${index}`} d={segmentToPath(segment)} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {fatigueSegments.map((segment, index) => (
              <path key={`fatigue-${index}`} d={segmentToPath(segment)} fill="none" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            ))}

            {timeline.map((point, index) => {
              const values = [point.attention, point.fatigue].filter(isFiniteNumber);
              if (values.length === 0) return null;
              const x = xScale(point.elapsedMs);
              const y = yScale(values[0]);
              return (
                <circle
                  key={point.id || index}
                  cx={x}
                  cy={y}
                  r="7"
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint({ ...point, x, y })}
                  onFocus={() => setHoveredPoint({ ...point, x, y })}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onBlur={() => setHoveredPoint(null)}
                  tabIndex={0}
                  aria-label={`Sample at ${formatDuration(point.elapsedMs)}`}
                />
              );
            })}
          </svg>
        )}

        {hoveredPoint && (
          <ChartTooltip x={(hoveredPoint.x / width) * 100 + "%"} y={(hoveredPoint.y / height) * 100 + "%"}>
            <div className="space-y-1">
              <p className="font-bold text-white">{formatDuration(hoveredPoint.elapsedMs)}</p>
              <p>Attention: {formatMetricValue(hoveredPoint.attention)}{isFiniteNumber(hoveredPoint.attention) ? "%" : ""}</p>
              <p>Fatigue: {formatMetricValue(hoveredPoint.fatigue)}{isFiniteNumber(hoveredPoint.fatigue) ? "%" : ""}</p>
              <p>Data quality: {hoveredPoint.dataQuality || "Unavailable"}</p>
            </div>
          </ChartTooltip>
        )}
      </div>
    </section>
  );
}
