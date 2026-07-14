"use client";

import React from "react";
import { useAppState } from "../context/AppContext";

export default function DashboardCharts() {
  const {
    focus,
    stress,
    fatigue,
    arousal,
    metricsHistory,
    isMonitoring
  } = useAppState();

  // Helper to calculate circular gauge path
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
    //Helper to calculate the length of the hidden part based on the percentage value
  const getStrokeDashoffset = (value) => {
    return circumference - (value / 100) * circumference;
  };

  // --- SVG LINE CHART CALCULATIONS ---
  const chartWidth = 600;
  const chartHeight = 250;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const drawableWidth = chartWidth - paddingLeft - paddingRight;
  const drawableHeight = chartHeight - paddingTop - paddingBottom;

  const getCoordinates = (index, value, totalPoints) => {
    const x = paddingLeft + (index / Math.max(1, totalPoints - 1)) * drawableWidth;
    const y = paddingTop + (1 - value / 100) * drawableHeight;
    return { x, y };
  };

  // Generate SVG Path for a specific metric key
  const generatePath = (key, history) => {
    if (history.length < 2) return "";
    
    let pathStr = "";
    history.forEach((point, idx) => {
      const { x, y } = getCoordinates(idx, point[key] || 0, history.length);
      if (idx === 0) {
        pathStr += `M ${x} ${y}`;
      } else {
        // Can use cubic bezier curves for smooth lines
        const prevPoint = getCoordinates(idx - 1, history[idx - 1][key] || 0, history.length);
        const cpX1 = prevPoint.x + (x - prevPoint.x) / 2;
        const cpY1 = prevPoint.y;
        const cpX2 = prevPoint.x + (x - prevPoint.x) / 2;
        const cpY2 = y;
        pathStr += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
      }
    });
    return pathStr;
  };

  // Generate SVG Area Path for gradients
  const generateAreaPath = (key, history) => {
    if (history.length < 2) return "";
    const linePath = generatePath(key, history);
    const startPoint = getCoordinates(0, 0, history.length);
    const endPoint = getCoordinates(history.length - 1, 0, history.length);
    
    return `${linePath} L ${endPoint.x} ${endPoint.y} L ${startPoint.x} ${startPoint.y} Z`;
  };

  // --- SVG RADAR CHART CALCULATIONS ---
  const radarSize = 200;
  const radarCenter = radarSize / 2;
  const radarRadius = 75;

  // 4 Axes: Up (Focus), Right (Arousal), Down (Fatigue), Left (Stress)
  const radarAxes = [
    { name: "Focus", angle: -Math.PI / 2, value: focus, color: "text-cyan-400" },
    { name: "Arousal", angle: 0, value: arousal, color: "text-amber-400" },
    { name: "Fatigue", angle: Math.PI / 2, value: fatigue, color: "text-rose-400" },
    { name: "Stress", angle: Math.PI, value: stress, color: "text-orange-400" }
  ];

  // Get coordinates for a value on an axis
  const getRadarPoint = (value, angle) => {
    const length = (value / 100) * radarRadius;
    const x = radarCenter + length * Math.cos(angle);
    const y = radarCenter + length * Math.sin(angle);
    return { x, y };
  };

  // Generate the current state polygon path
  const generateRadarPolygon = () => {
    const points = radarAxes.map(axis => {
      const { x, y } = getRadarPoint(axis.value, axis.angle);
      return `${x},${y}`;
    });
    return points.join(" ");
  };

  // Generate concentric grid polygon paths (e.g. 25%, 50%, 75%, 100%)
  const generateGridPolygon = (percent) => {
    const points = radarAxes.map(axis => {
      const length = percent * radarRadius;
      const x = radarCenter + length * Math.cos(axis.angle);
      const y = radarCenter + length * Math.sin(axis.angle);
      return `${x},${y}`;
    });
    return points.join(" ");
  };

  // Stats summaries
  const avgFocus = metricsHistory.length > 0 
    ? Math.round(metricsHistory.reduce((sum, p) => sum + p.focus, 0) / metricsHistory.length)
    : focus;
  const avgStress = metricsHistory.length > 0
    ? Math.round(metricsHistory.reduce((sum, p) => sum + p.stress, 0) / metricsHistory.length)
    : stress;
  const maxFatigue = metricsHistory.length > 0
    ? Math.max(...metricsHistory.map(p => p.fatigue))
    : fatigue;

  return (
    <div className="space-y-6">
      {/* 1. Real-time Circular Gauges */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Focus Gauge */}
        <div className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Focus Index</span>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle cx="48" cy="48" r={radius} className="stroke-slate-900 fill-none" strokeWidth="6" />
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-cyan-500 fill-none transition-all duration-500"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={getStrokeDashoffset(focus)}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 4px rgba(6,182,212,0.5))" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-xl font-black text-white">{focus}%</span>
              <span className="text-[9px] text-slate-500">
                {focus > 75 ? "Excellent" : focus > 50 ? "Moderate" : "Low"}
              </span>
            </div>
          </div>
        </div>

        {/* Stress Gauge */}
        <div className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Stress Level</span>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle cx="48" cy="48" r={radius} className="stroke-slate-900 fill-none" strokeWidth="6" />
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-orange-500 fill-none transition-all duration-500"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={getStrokeDashoffset(stress)}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 4px rgba(249,115,22,0.5))" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-xl font-black text-white">{stress}%</span>
              <span className="text-[9px] text-slate-500">
                {stress > 70 ? "High" : stress > 35 ? "Elevated" : "Calm"}
              </span>
            </div>
          </div>
        </div>

        {/* Fatigue Gauge */}
        <div className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Fatigue Index</span>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle cx="48" cy="48" r={radius} className="stroke-slate-900 fill-none" strokeWidth="6" />
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-rose-500 fill-none transition-all duration-500"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={getStrokeDashoffset(fatigue)}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 4px rgba(244,63,94,0.5))" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-xl font-black text-white">{fatigue}%</span>
              <span className="text-[9px] text-slate-500">
                {fatigue > 60 ? "Exhausted" : fatigue > 30 ? "Tired" : "Rested"}
              </span>
            </div>
          </div>
        </div>

        {/* Arousal Gauge */}
        <div className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Arousal / Drive</span>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle cx="48" cy="48" r={radius} className="stroke-slate-900 fill-none" strokeWidth="6" />
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-amber-500 fill-none transition-all duration-500"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={getStrokeDashoffset(arousal)}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 4px rgba(245,158,11,0.5))" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-xl font-black text-white">{arousal}%</span>
              <span className="text-[9px] text-slate-500">
                {arousal > 70 ? "Hyper" : arousal > 40 ? "Engaged" : "Drowsy"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Line Chart & Radar Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Session Timeline (Line Chart) */}
        <div className="relative flex flex-col rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Session Timeline</h3>
              <p className="text-[10px] text-slate-500">Real-time mental state fluctuations</p>
            </div>
            
            {/* Chart Legend */}
            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="h-1.5 w-3 rounded-full bg-cyan-400 inline-block" /> Focus
              </span>
              <span className="flex items-center gap-1 text-orange-400">
                <span className="h-1.5 w-3 rounded-full bg-orange-400 inline-block" /> Stress
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="h-1.5 w-3 rounded-full bg-rose-400 inline-block" /> Fatigue
              </span>
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            {metricsHistory.length < 2 ? (
              <div className="flex h-[250px] w-full items-center justify-center text-xs text-slate-500">
                {isMonitoring ? "Gathering telemetry..." : "Start session to collect timeline data"}
              </div>
            ) : (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
                <defs>
                  {/* Glowing Area Gradients */}
                  <linearGradient id="gradient-focus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="gradient-stress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="gradient-fatigue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Grid Lines */}
                {[0, 25, 50, 75, 100].map((val) => {
                  const y = paddingTop + (1 - val / 100) * drawableHeight;
                  return (
                    <g key={val}>
                      <line
                        x1={paddingLeft}
                        y1={y}
                        x2={chartWidth - paddingRight}
                        y2={y}
                        stroke="rgba(255, 255, 255, 0.05)"
                        strokeWidth="1"
                      />
                      <text
                        x={paddingLeft - 10}
                        y={y + 4}
                        fill="rgba(148, 163, 184, 0.5)"
                        fontSize="10"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}

                {/* X-Axis labels (timestamps) */}
                {metricsHistory.map((point, idx) => {
                  if (idx % Math.ceil(metricsHistory.length / 5) !== 0) return null;
                  const { x } = getCoordinates(idx, 0, metricsHistory.length);
                  return (
                    <text
                      key={idx}
                      x={x}
                      y={chartHeight - 10}
                      fill="rgba(148, 163, 184, 0.5)"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {point.timestamp}
                    </text>
                  );
                })}

                {/* Filled Areas under lines */}
                <path d={generateAreaPath("focus", metricsHistory)} fill="url(#gradient-focus)" />
                <path d={generateAreaPath("stress", metricsHistory)} fill="url(#gradient-stress)" />
                <path d={generateAreaPath("fatigue", metricsHistory)} fill="url(#gradient-fatigue)" />

                {/* Lines */}
                <path
                  d={generatePath("focus", metricsHistory)}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d={generatePath("stress", metricsHistory)}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d={generatePath("fatigue", metricsHistory)}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Mental State Balance (Radar Chart) */}
        <div className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl">
          <div className="w-full text-left mb-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cognitive Balance</h3>
            <p className="text-[10px] text-slate-500">Current state distribution</p>
          </div>

          <div className="relative flex items-center justify-center h-[220px]">
            <svg width={radarSize} height={radarSize} className="mx-auto">
              {/* Concentric Grid Rings */}
              {[0.25, 0.5, 0.75, 1.0].map((pct) => (
                <polygon
                  key={pct}
                  points={generateGridPolygon(pct)}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                />
              ))}

              {/* Axis lines */}
              {radarAxes.map((axis, i) => {
                const outerPoint = getRadarPoint(100, axis.angle);
                return (
                  <line
                    key={i}
                    x1={radarCenter}
                    y1={radarCenter}
                    x2={outerPoint.x}
                    y2={outerPoint.y}
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* Data Shape */}
              <polygon
                points={generateRadarPolygon()}
                fill="rgba(6, 182, 212, 0.15)"
                stroke="#06b6d4"
                strokeWidth="2"
                style={{ transition: "all 0.5s ease" }}
              />

              {/* Custom dots for data points */}
              {radarAxes.map((axis, i) => {
                const pt = getRadarPoint(axis.value, axis.angle);
                let dotColor = "#06b6d4";
                if (axis.name === "Stress") dotColor = "#f97316";
                if (axis.name === "Fatigue") dotColor = "#f43f5e";
                if (axis.name === "Arousal") dotColor = "#f59e0b";

                return (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill={dotColor}
                    stroke="white"
                    strokeWidth="1"
                    style={{ transition: "all 0.5s ease", filter: "drop-shadow(0 0 2px rgba(0,0,0,0.5))" }}
                  />
                );
              })}

              {/* Labels */}
              {radarAxes.map((axis, i) => {
                const pt = getRadarPoint(120, axis.angle);
                // Adjust anchor alignment based on quadrant
                let textAnchor = "middle";
                if (axis.angle === 0) textAnchor = "start";
                if (axis.angle === Math.PI) textAnchor = "end";

                let dy = "3";
                if (axis.angle === -Math.PI / 2) dy = "-2";
                if (axis.angle === Math.PI / 2) dy = "10";

                return (
                  <text
                    key={i}
                    x={pt.x}
                    y={pt.y}
                    dy={dy}
                    fill="rgba(148, 163, 184, 0.7)"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor={textAnchor}
                  >
                    {axis.name}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* 3. Session Statistics Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Average Focus</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-400">{avgFocus}%</span>
            <span className="text-xs text-slate-400">Target: &gt;75%</span>
          </div>
          <div className="mt-2 h-1 w-full rounded bg-slate-950 overflow-hidden">
            <div className="h-full bg-cyan-400 rounded" style={{ width: `${avgFocus}%` }} />
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Avg Stress Level</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-orange-400">{avgStress}%</span>
            <span className="text-xs text-slate-400">Threshold: 50%</span>
          </div>
          <div className="mt-2 h-1 w-full rounded bg-slate-950 overflow-hidden">
            <div className="h-full bg-orange-400 rounded" style={{ width: `${avgStress}%` }} />
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Peak Fatigue Index</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-400">{maxFatigue}%</span>
            <span className="text-xs text-slate-400">Critical: &gt;70%</span>
          </div>
          <div className="mt-2 h-1 w-full rounded bg-slate-950 overflow-hidden">
            <div className="h-full bg-rose-400 rounded" style={{ width: `${maxFatigue}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
