"use client";

import React, { useState } from "react";
import { useAppState } from "../context/AppContext";

export default function DebugPanel() {
  const {
    focus,
    setFocus,
    stress,
    setStress,
    fatigue,
    setFatigue,
    arousal,
    setArousal,
    blinkRate,
    setBlinkRate,
    yawnCount,
    setYawnCount,
    headPose,
    setHeadPose,
    currentGesture,
    setCurrentGesture,
    fps,
    latency,
    eventLog,
    addLog,
    resetMetrics,
    isMonitoring,

    // AI SDK additions
    isAiLoaded,
    aiLoadingProgress,
    aiError,
    inferenceFps,
    setInferenceFps,
    telemetryTable,
    exportTelemetryCSV,
    eyeOpenness
  } = useAppState();

  const [customLog, setCustomLog] = useState("");
  const [activeTab, setActiveTab] = useState("simulator"); // simulator, telemetry

  const injectYawn = () => {
    setYawnCount((prev) => prev + 1);
    setFatigue((prev) => Math.min(100, prev + 15));
    setFocus((prev) => Math.max(0, prev - 10));
    addLog("DEBUG: Injected Yawn event. Fatigue increased.", "warning");
  };

  const injectBlink = () => {
    setBlinkRate((prev) => Math.min(30, prev + 1));
    addLog("DEBUG: Injected Blink event.", "debug");
  };

  const injectGesture = (gesture) => {
    setCurrentGesture(gesture);
    addLog(`DEBUG: Injected Gesture: ${gesture}`, "info");
  };

  const handleCustomLogSubmit = (e) => {
    e.preventDefault();
    if (!customLog.trim()) return;
    addLog(`USER_DEBUG: ${customLog}`, "info");
    setCustomLog("");
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-300">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-sm font-bold tracking-wide text-white uppercase">CV Telemetry & Debug</h2>
        </div>
        <button
          onClick={resetMetrics}
          className="rounded bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-slate-300 border border-white/10 hover:bg-slate-850 hover:text-white transition-all"
        >
          Reset Baseline
        </button>
      </div>

      {/* Model Loader Status */}
      {!isAiLoaded && (
        <div className="mt-3 rounded-xl bg-slate-900/60 p-3 border border-white/5 text-[11px] space-y-2">
          <div className="flex justify-between font-semibold text-slate-350">
            <span>{aiError ? "AI Load Error" : "Loading Web-SDK AI Models..."}</span>
            <span className="font-mono text-cyan-400">{aiLoadingProgress}%</span>
          </div>
          <div className="h-1.5 w-full rounded bg-slate-950 overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${aiError ? "bg-red-500" : "bg-cyan-400"}`} 
              style={{ width: `${aiLoadingProgress}%` }} 
            />
          </div>
          {aiError && <p className="text-[10px] text-red-400">{aiError}</p>}
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex border-b border-white/5 mt-3 shrink-0">
        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex-1 pb-2 text-[10px] uppercase font-bold tracking-wider transition-all border-b-2 text-center ${
            activeTab === "simulator"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          Overrides
        </button>
        <button
          onClick={() => setActiveTab("telemetry")}
          className={`flex-1 pb-2 text-[10px] uppercase font-bold tracking-wider transition-all border-b-2 text-center ${
            activeTab === "telemetry"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          Telemetry Log
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-5 mt-4 text-xs">
        {activeTab === "simulator" ? (
          <>
            {/* Section: Frame Sampler Configuration */}
            <div className="space-y-2 bg-cyan-950/10 border border-cyan-500/10 rounded-xl p-3">
              <h3 className="font-bold text-cyan-400 uppercase tracking-wider text-[10px]">Frame Sampler Config</h3>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Reduce sampler rate to save computing budget. Current: <span className="text-white font-bold">{inferenceFps} FPS</span> (every {Math.round(1000/inferenceFps)}ms)
              </p>
              <div className="space-y-1">
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={inferenceFps}
                  onChange={(e) => {
                    setInferenceFps(parseInt(e.target.value));
                    addLog(`Frame sampler rate adjusted to ${e.target.value} FPS`, "debug");
                  }}
                  className="w-full accent-cyan-400 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                  <span>1 FPS (Eco)</span>
                  <span>5 FPS (Def)</span>
                  <span>15 FPS (Max)</span>
                </div>
              </div>
            </div>

            {/* Section: Interactive Simulation Sliders */}
            <div className="space-y-3">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Manual State Overrides</h3>
              
              {/* Focus Slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Focus Index</span>
                  <span className="text-cyan-400 font-bold">{focus}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={focus}
                  onChange={(e) => {
                    setFocus(parseInt(e.target.value));
                    addLog(`Focus manually adjusted to ${e.target.value}%`, "debug");
                  }}
                  className="w-full accent-cyan-400 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                />
              </div>

              {/* Stress Slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Stress Level</span>
                  <span className="text-orange-400 font-bold">{stress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={stress}
                  onChange={(e) => {
                    setStress(parseInt(e.target.value));
                    addLog(`Stress manually adjusted to ${e.target.value}%`, "debug");
                  }}
                  className="w-full accent-orange-400 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                />
              </div>

              {/* Fatigue Slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Fatigue Index</span>
                  <span className="text-rose-400 font-bold">{fatigue}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={fatigue}
                  onChange={(e) => {
                    setFatigue(parseInt(e.target.value));
                    addLog(`Fatigue manually adjusted to ${e.target.value}%`, "debug");
                  }}
                  className="w-full accent-rose-400 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                />
              </div>

              {/* Arousal Slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Arousal / Engagement</span>
                  <span className="text-amber-400 font-bold">{arousal}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={arousal}
                  onChange={(e) => {
                    setArousal(parseInt(e.target.value));
                    addLog(`Arousal manually adjusted to ${e.target.value}%`, "debug");
                  }}
                  className="w-full accent-amber-400 bg-slate-900 rounded-lg appearance-none h-1.5 cursor-pointer"
                />
              </div>
            </div>

            {/* Section: Raw Coordinates & Values */}
            <div className="space-y-2.5 bg-slate-900/40 border border-white/5 rounded-xl p-3">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Raw Landmarking Data</h3>
              
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded bg-slate-950/80 p-1.5 border border-white/5">
                  <span className="text-slate-500 block text-[9px] uppercase">Head Pose</span>
                  <span className="text-white font-mono">Y: {headPose.yaw}° | P: {headPose.pitch}°</span>
                </div>
                <div className="rounded bg-slate-950/80 p-1.5 border border-white/5">
                  <span className="text-slate-500 block text-[9px] uppercase">Eye Openness</span>
                  <span className="text-cyan-400 font-mono font-bold">{(eyeOpenness * 100).toFixed(0)}%</span>
                </div>
                <div className="rounded bg-slate-950/80 p-1.5 border border-white/5">
                  <span className="text-slate-500 block text-[9px] uppercase">Blinks (Rate)</span>
                  <span className="text-white font-mono">{blinkRate} blinks/min</span>
                </div>
                <div className="rounded bg-slate-950/80 p-1.5 border border-white/5">
                  <span className="text-slate-500 block text-[9px] uppercase">Current Gesture</span>
                  <span className="text-cyan-400 font-semibold truncate block">{currentGesture}</span>
                </div>
              </div>

              {/* Performance stats */}
              <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1.5 border-t border-white/5">
                <span>Sampler Target: <span className="font-mono text-cyan-400">{inferenceFps} FPS</span></span>
                <span>Latency: <span className="font-mono text-emerald-400">{latency} ms</span></span>
              </div>
            </div>

            {/* Section: Event Injector Buttons */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Simulate CV Events</h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={injectBlink}
                  className="flex-1 min-w-[70px] rounded bg-slate-900 border border-white/10 py-1 hover:bg-slate-850 text-slate-300 font-medium text-[10px] transition-all"
                >
                  👁️ Blink
                </button>
                <button
                  onClick={injectYawn}
                  className="flex-1 min-w-[70px] rounded bg-slate-900 border border-white/10 py-1 hover:bg-slate-850 text-slate-300 font-medium text-[10px] transition-all"
                >
                  🥱 Yawn
                </button>
                <button
                  onClick={() => injectGesture("Hand on Chin")}
                  className="flex-1 min-w-[90px] rounded bg-slate-900 border border-white/10 py-1 hover:bg-slate-850 text-slate-300 font-medium text-[10px] transition-all"
                >
                  🤔 Hand on Chin
                </button>
                <button
                  onClick={() => injectGesture("Leaning Forward")}
                  className="flex-1 min-w-[90px] rounded bg-slate-900 border border-white/10 py-1 hover:bg-slate-850 text-slate-300 font-medium text-[10px] transition-all"
                >
                  ↗️ Lean Forward
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3 flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Consolidated Telemetry Table</h3>
              <button
                onClick={exportTelemetryCSV}
                className="rounded bg-gradient-to-r from-cyan-500 to-blue-500 px-2.5 py-1 text-[9px] font-bold text-white shadow-md shadow-cyan-500/10 hover:from-cyan-400 hover:to-blue-400 transition-all"
              >
                📥 Export CSV
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-white/15 bg-black/45 shadow-inner max-h-[360px]">
              <table className="w-full text-left border-collapse text-[10px] text-slate-300">
                <thead className="sticky top-0 bg-slate-950 text-slate-400 border-b border-white/10 uppercase tracking-wider text-[8px] font-bold">
                  <tr>
                    <th className="p-2 border-r border-white/5">Time</th>
                    <th className="p-2 border-r border-white/5">Eye Open</th>
                    <th className="p-2 border-r border-white/5">Blink</th>
                    <th className="p-2 border-r border-white/5">Yaw/Pitch</th>
                    <th className="p-2 border-r border-white/5">Gesture</th>
                    <th className="p-2 text-center">Hands</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {telemetryTable.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-4 text-center text-slate-500 italic">
                        {isMonitoring ? "Waiting for frame samples..." : "Start session to record data frames"}
                      </td>
                    </tr>
                  ) : (
                    telemetryTable.map((row) => (
                      <tr key={row.id} className="hover:bg-white/5">
                        <td className="p-2 border-r border-white/5 text-slate-500">{row.time}</td>
                        <td className="p-2 border-r border-white/5 text-cyan-400 font-bold">{Number.isFinite(row.eyeOpenness) ? row.eyeOpenness.toFixed(2) : "n/a"}</td>
                        <td className={`p-2 border-r border-white/5 font-bold ${row.blink === "Yes" ? "text-amber-400 animate-pulse" : "text-slate-500"}`}>{row.blink}</td>
                        <td className="p-2 border-r border-white/5 text-slate-400">{row.yaw}°/{row.pitch}°</td>
                        <td className={`p-2 border-r border-white/5 font-semibold ${row.gesture !== "None" ? "text-emerald-400" : "text-slate-500"}`}>{row.gesture}</td>
                        <td className="p-2 text-center text-slate-400">{row.hands}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <p className="text-[9px] text-slate-500 leading-relaxed italic">
              * Table displays aggregated indices per sampled video frame. Export logs as CSV to inspect full X/Y/Z coordinate matrices.
            </p>
          </div>
        )}

        {/* Section: Event Log (Console) */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Real-time Log Console</h3>
            {!isMonitoring && (
              <span className="text-[9px] text-amber-500 animate-pulse font-semibold">PAUSED</span>
            )}
          </div>

          {/* The scrolling terminal log */}
          <div className="h-32 w-full overflow-y-auto rounded-lg border border-white/10 bg-black/85 p-2 font-mono text-[10px] leading-relaxed shadow-inner">
            {eventLog.length === 0 ? (
              <p className="text-slate-600">No events logged yet.</p>
            ) : (
              eventLog.map((log) => {
                let colorClass = "text-slate-400";
                if (log.type === "success") colorClass = "text-emerald-400";
                if (log.type === "warning") colorClass = "text-amber-400";
                if (log.type === "error") colorClass = "text-red-400";
                if (log.type === "debug") colorClass = "text-cyan-400/80";

                return (
                  <div key={log.id} className="border-b border-white/5 py-0.5 last:border-b-0">
                    <span className="text-slate-600">[{log.time}]</span>{" "}
                    <span className={colorClass}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Custom Log Injector Form */}
          <form onSubmit={handleCustomLogSubmit} className="flex gap-1.5">
            <input
              type="text"
              placeholder="Inject custom log message..."
              value={customLog}
              onChange={(e) => setCustomLog(e.target.value)}
              className="flex-1 rounded bg-slate-900 border border-white/10 px-2 py-1 text-[10px] text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="rounded bg-cyan-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-cyan-500 transition-all"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
