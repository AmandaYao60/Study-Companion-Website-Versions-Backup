"use client";

import React from "react";
import { useAppState } from "../../context/AppContext";
import DashboardCharts from "../../components/DashboardCharts";

export default function DashboardPage() {
  const {
    isDebugMode,
    isMonitoring,
    focus,
    setFocus,
    stress,
    setStress,
    fatigue,
    setFatigue,
    arousal,
    setArousal,
    resetMetrics,
    metricsHistory
  } = useAppState();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Analytics Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Analyze your cognitive performance, fatigue patterns, and stress thresholds over time.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={resetMetrics}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
          >
            Clear Session Data
          </button>
          <button
            onClick={() => alert("Report compilation is a placeholder for Phase 2 implementation. In a full build, this compiles local SQLite database metrics into a PDF summary.")}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-400 transition-all"
          >
            Export PDF Report
          </button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Left 3 Columns: Charts */}
        <div className="lg:col-span-3 space-y-6">
          {/* Active Status Banner */}
          {!isMonitoring && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
              <svg className="h-5 w-5 text-amber-500 shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Session Paused / Idle</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  The monitoring stream is offline. Displaying cached session metrics. Go to the <span className="text-cyan-400 font-semibold">Study Space</span> to resume.
                </p>
              </div>
            </div>
          )}

          {/* Render Dashboard Charts (Circular Gauges, Line Chart, Radar Chart) */}
          <DashboardCharts />
        </div>

        {/* Right 1 Column: Sidebar Insights & Quick Debug */}
        <div className="space-y-6">
          {/* Quick Debug Overrides (Visible only in Debug Mode) */}
          {isDebugMode && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-5 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="border-b border-cyan-500/10 pb-2 flex justify-between items-center">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Chart Simulator</h3>
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              <p className="text-[10px] text-slate-400">
                Adjust sliders to watch the SVG line curves, circular gauges, and radar polygon warp in real time.
              </p>

              {/* Focus Override */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Focus</span>
                  <span className="text-cyan-400 font-bold">{focus}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={focus}
                  onChange={(e) => setFocus(parseInt(e.target.value))}
                  className="w-full accent-cyan-400 bg-slate-900 rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>

              {/* Stress Override */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Stress</span>
                  <span className="text-orange-400 font-bold">{stress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={stress}
                  onChange={(e) => setStress(parseInt(e.target.value))}
                  className="w-full accent-orange-400 bg-slate-900 rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>

              {/* Fatigue Override */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Fatigue</span>
                  <span className="text-rose-400 font-bold">{fatigue}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={fatigue}
                  onChange={(e) => setFatigue(parseInt(e.target.value))}
                  className="w-full accent-rose-400 bg-slate-900 rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>

              {/* Arousal Override */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Arousal</span>
                  <span className="text-amber-400 font-bold">{arousal}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={arousal}
                  onChange={(e) => setArousal(parseInt(e.target.value))}
                  className="w-full accent-amber-400 bg-slate-900 rounded-lg appearance-none h-1 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Session Insights */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Session Diagnosis</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Automated wellness feedback</p>
            </div>

            <div className="space-y-3 text-xs">
              {/* Alert 1: Focus Efficiency */}
              <div className="rounded-xl bg-slate-900/50 p-3 border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-cyan-400 uppercase">Focus Quality</span>
                <p className="text-slate-300 font-medium">High Cognitive Output</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Your focus has remained above 75% for 82% of the session. You are working in highly efficient cycles.
                </p>
              </div>

              {/* Alert 2: Eye strain */}
              <div className="rounded-xl bg-slate-900/50 p-3 border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-amber-500 uppercase">Visual Fatigue Risk</span>
                <p className="text-slate-300 font-medium">Reduced Blink Frequency</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Average blink rate dropped to 10/min during deep focus. Standard is 15/min. Consider the 20-20-20 rule to prevent dry eyes.
                </p>
              </div>

              {/* Alert 3: Stress */}
              <div className="rounded-xl bg-slate-900/50 p-3 border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Cardiovascular Stress</span>
                <p className="text-slate-300 font-medium">Minimal Tension Detected</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Micro-posture shifts indicate low physical tension. Stress levels are well within the resting baseline.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
