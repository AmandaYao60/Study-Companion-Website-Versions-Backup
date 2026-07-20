"use client";

import React from "react";
import { useAppState } from "../../context/AppContext";
import CameraFeed from "../../components/CameraFeed";
import DebugPanel from "../../components/DebugPanel";
import SessionControls from "../../components/SessionControls";
import useSmoothSessionTimer from "../../hooks/useSmoothSessionTimer";

export default function MonitorPage() {
  const {
    isDebugMode,
    isMonitoring,
    focus,
    stress,
    fatigue,
    currentGesture
  } = useAppState();

  const { formatted } = useSmoothSessionTimer(250);

  // Dynamic AI Companion Advice based on current mental states
  const getAICompanionAdvice = () => {
    if (!isMonitoring) {
      return {
        title: "Ready when you are",
        message: "Hello! I am your AI study companion. Start the session to begin monitoring your focus, stress, and fatigue. I will provide real-time wellness recommendations as you study.",
        status: "idle"
      };
    }

    if (fatigue > 65) {
      return {
        title: "Take a break, friend",
        message: `I notice your fatigue is quite high (${fatigue}%). You've yawned recently and your posture is leaning back. Let's pause for a 5-minute screen break to rest your eyes and stretch.`,
        status: "warning"
      };
    }

    if (stress > 55) {
      return {
        title: "Let's decompress",
        message: `Your stress index is elevated at ${stress}%. I'm detecting slightly faster blinks and tension. Let's do a 4-second box breathing exercise. Inhale... hold... exhale...`,
        status: "stress"
      };
    }

    if (focus > 80) {
      return {
        title: "Deep Flow State Active",
        message: `Excellent focus level (${focus}%)! Your gaze is locked and your posture is steady. I've silenced all notifications. Keep up this momentum!`,
        status: "focus"
      };
    }

    if (focus < 45) {
      return {
        title: "Distraction detected",
        message: `Your focus has dipped to ${focus}%. Your head is turned away from the screen. Try taking a sip of water, adjusting your chair, and re-engaging with your work.`,
        status: "distracted"
      };
    }

    return {
      title: "Doing great!",
      message: "Your cognitive metrics are balanced. You are maintaining a healthy posture and steady engagement. I will keep watching for any signs of fatigue.",
      status: "nominal"
    };
  };

  const advice = getAICompanionAdvice();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Study & Monitoring Space</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time mental state tracking using computer vision. Turn on Debug Mode in the navbar to test.
          </p>
        </div>

        {/* Session Timer Card */}
        <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-slate-900/40 px-5 py-3 backdrop-blur-xl">
          <div className="text-left">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Session Time</span>
            <span className="font-mono text-xl font-bold text-white">
              {formatted}
            </span>
          </div>
          <div className="h-8 w-[1px] bg-white/10" />
          <div className="text-left">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Posture</span>
            <span className={`text-xs font-semibold ${
              currentGesture === "Resting Head" 
                ? "text-rose-400" 
                : currentGesture === "Leaning Forward"
                ? "text-cyan-400"
                : "text-slate-300"
            }`}>
              {currentGesture === "Resting Head" 
                ? "Slouched / Fatigue" 
                : currentGesture === "Leaning Forward"
                ? "Engaged"
                : "Nominal"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1 & 2: Camera Feed & Companion Advice */}
        <div className="lg:col-span-2 space-y-6">
          <CameraFeed presentation="monitor" showControls />

          {/* AI Companion Advice Card */}
          <div className={`relative overflow-hidden rounded-2xl border p-5 shadow-xl transition-all duration-500 ${
            advice.status === "focus"
              ? "border-cyan-500/20 bg-cyan-950/10"
              : advice.status === "warning"
              ? "border-rose-500/20 bg-rose-950/10"
              : advice.status === "stress"
              ? "border-orange-500/20 bg-orange-950/10"
              : advice.status === "distracted"
              ? "border-amber-500/20 bg-amber-950/10"
              : "border-white/10 bg-slate-950/40"
          }`}>
            {/* Ambient glowing border */}
            <div className={`absolute top-0 left-0 right-0 h-[2px] ${
              advice.status === "focus"
                ? "bg-cyan-500 shadow-[0_1px_15px_rgba(6,182,212,0.5)]"
                : advice.status === "warning"
                ? "bg-rose-500 shadow-[0_1px_15px_rgba(244,63,94,0.5)]"
                : advice.status === "stress"
                ? "bg-orange-500 shadow-[0_1px_15px_rgba(249,115,22,0.5)]"
                : advice.status === "distracted"
                ? "bg-amber-500 shadow-[0_1px_15px_rgba(245,158,11,0.5)]"
                : "bg-white/10"
            }`} />

            <div className="flex gap-4 items-start">
              {/* Avatar Icon */}
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-lg ${
                advice.status === "focus"
                  ? "border-cyan-500/30 bg-cyan-950 text-cyan-400"
                  : advice.status === "warning"
                  ? "border-rose-500/30 bg-rose-950 text-rose-400"
                  : advice.status === "stress"
                  ? "border-orange-500/30 bg-orange-950 text-orange-400"
                  : advice.status === "distracted"
                  ? "border-amber-500/30 bg-amber-950 text-amber-400"
                  : "border-white/10 bg-slate-900 text-slate-400"
              }`}>
                {advice.status === "focus" && (
                  <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                {advice.status === "warning" && (
                  <svg className="h-6 w-6 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                {advice.status === "stress" && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
                {advice.status === "distracted" && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
                {advice.status === "nominal" && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {advice.status === "idle" && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">{advice.title}</h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{advice.message}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Session Controls plus Debug Panel or Production Sidebar */}
        <div className="space-y-6">
          <SessionControls />
          {isDebugMode ? (
            <DebugPanel />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl h-full space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Focus Objectives</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">Stay on track with your tasks</p>
              </div>

              {/* Todo List Placeholder */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-900/30 p-3 hover:bg-slate-900/50 cursor-pointer transition-all">
                  <input type="checkbox" defaultChecked className="rounded border-white/25 text-cyan-500 bg-transparent focus:ring-0" />
                  <span className="text-xs text-slate-400 line-through">Review CV algorithms logic</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-900/30 p-3 hover:bg-slate-900/50 cursor-pointer transition-all">
                  <input type="checkbox" className="rounded border-white/25 text-cyan-500 bg-transparent focus:ring-0" />
                  <span className="text-xs text-slate-200">Study landmark mesh integration details</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-900/30 p-3 hover:bg-slate-900/50 cursor-pointer transition-all">
                  <input type="checkbox" className="rounded border-white/25 text-cyan-500 bg-transparent focus:ring-0" />
                  <span className="text-xs text-slate-200">Verify local browser inference latency</span>
                </label>
              </div>

              {/* Recommendation Widget */}
              <div className="rounded-xl bg-slate-900/50 border border-white/5 p-4 space-y-3">
                <h3 className="text-xs font-bold text-white">Study Space Insights</h3>
                
                <div className="space-y-2 text-[11px] leading-relaxed text-slate-400">
                  <p>💡 <strong>Did you know?</strong> Sustained focus for more than 45 minutes without blinking regularly can lead to computer vision syndrome (dry eyes).</p>
                  <p>🧘 <strong>Posture Alert:</strong> Keep your screen at eye level. AegisMind will alert you if you slouch or rest your chin for more than 3 minutes.</p>
                </div>
              </div>

              {/* Quick statistics */}
              <div className="rounded-xl border border-white/5 bg-slate-900/20 p-4 flex justify-between text-center">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase font-semibold block">Focus Quality</span>
                  <span className="text-lg font-black text-cyan-400 mt-0.5 block">{isMonitoring ? "Optimal" : "--"}</span>
                </div>
                <div className="w-[1px] bg-white/5" />
                <div>
                  <span className="text-[9px] text-slate-500 uppercase font-semibold block">Breaks Recommended</span>
                  <span className="text-lg font-black text-amber-500 mt-0.5 block">{isMonitoring ? "0" : "--"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
