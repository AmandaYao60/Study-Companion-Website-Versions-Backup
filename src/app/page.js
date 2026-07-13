"use client";

import React from "react";
import Link from "next/link";
import { useAppState } from "../context/AppContext";

export default function LandingPage() {
  const { isMonitoring } = useAppState();

  const features = [
    {
      icon: (
        <svg className="h-6 w-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
      title: "Facial Landmark Tracking",
      description: "Extracts micro-expressions, blink frequency, and head posture in real time to detect signs of eye strain, drowsiness, or distraction."
    },
    {
      icon: (
        <svg className="h-6 w-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11.571V9a4 4 0 00-8 0v2.571c0 1.96.306 3.854.87 5.637M12 11a13.93 13.93 0 013.248-8m1.5 13.571L16.5 16h-.758m1.5 0a9.04 9.04 0 01-1.5-1.429V11.571c0-1.96-.306-3.854-.87-5.637M12 11V9c0-1.282.755-2.43 1.944-2.906A9.015 9.015 0 0121 11.571V13a9 9 0 01-1.5 5.637m-3.44-2.04l-.054-.09" />
        </svg>
      ),
      title: "Gesture & Posture Analysis",
      description: "Detects physical habits like hand-on-chin (deep focus), leaning forward (high engagement), or slouching and resting head (mounting fatigue)."
    },
    {
      icon: (
        <svg className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 002-2h2a2 2 0 002 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: "Psychological State Inference",
      description: "Uses a multi-modal cognitive model to fuse landmarks and gestures, outputting clear scores for Focus, Stress, Fatigue, and Arousal."
    }
  ];

  const privacyLayers = [
    {
      level: "Frontend Level",
      name: "Privacy Shield Filter",
      desc: "Instantly blurs the camera feed. On-screen, you see only a geometric vector wireframe tracking your landmarks, ensuring your face is never visible."
    },
    {
      level: "Database Level",
      name: "Anonymized Metrics Only",
      desc: "No video frames, images, or raw facial data are ever saved. The database only records abstract, numerical score percentages (e.g., Focus: 82%)."
    },
    {
      level: "AI Level",
      name: "100% Local Inference",
      desc: "All computer vision and deep learning calculations happen locally in your browser sandbox. Absolutely zero video data is uploaded to external servers."
    }
  ];

  return (
    <div className="relative flex flex-col items-center justify-center bg-slate-950 px-4 overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

      {/* Hero Section */}
      <section className="mx-auto max-w-5xl py-20 text-center sm:py-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/5 px-3 py-1 text-xs font-semibold text-cyan-400 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          AegisMind Phase 1 POC
        </div>
        
        <h1 className="bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl">
          Your Intelligent AI<br />
          <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
            Study Companion
          </span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
          Optimize your study habits and protect your mental well-being. AegisMind uses advanced computer vision to analyze your focus, stress, and fatigue directly from your webcam—safely, privately, and locally.
        </p>

        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/monitor"
            className="group relative flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-6 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-blue-400"
          >
            Enter Study Space
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <Link
            href="/dashboard"
            className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50 px-6 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
          >
            View Demo Analytics
          </Link>
        </div>
      </section>

      {/* Feature Section */}
      <section className="mx-auto max-w-5xl w-full py-16 border-t border-white/5">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
          How AegisMind Supports Your Studies
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500">
          The companion tracks subtle cues to build a comprehensive profile of your mental workload and focus states.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((feat, idx) => (
            <div
              key={idx}
              className="relative flex flex-col rounded-2xl border border-white/5 bg-slate-900/20 p-6 shadow-xl backdrop-blur-xl hover:border-white/10 transition-all"
            >
              <div className="mb-4 rounded-xl bg-slate-950 p-3 border border-white/5 w-fit">
                {feat.icon}
              </div>
              <h3 className="text-base font-bold text-white mb-2">{feat.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{feat.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy Section */}
      <section className="mx-auto max-w-5xl w-full py-16 border-t border-white/5">
        <div className="rounded-3xl border border-cyan-500/10 bg-gradient-to-r from-slate-950 via-slate-900/80 to-slate-950 p-8 md:p-12 shadow-2xl relative overflow-hidden">
          {/* Decorative shield background icon */}
          <div className="absolute right-6 bottom-6 opacity-5 pointer-events-none">
            <svg className="h-64 w-64 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.9C2.944 3.941 4.545 3 7 3s4.056.941 4.834 1.9a11.961 11.961 0 00-2.316 6.726c0 1.792-.487 3.473-1.336 4.921C6.035 15.228 4.28 11.784 4.28 8c0-1.127-.156-2.218-.447-3.252a7.962 7.962 0 01-1.667.152zm12.333.1H15a1 1 0 011 1v2.5a5.5 5.5 0 005.5 5.5h.5a1 1 0 011 1v.5a5.5 5.5 0 01-5.5 5.5h-1a1 1 0 01-1-1v-2.5a5.5 5.5 0 00-5.5-5.5h-.5a1 1 0 01-1-1v-.5a5.5 5.5 0 015.5-5.5h1z" clipRule="evenodd" />
            </svg>
          </div>

          <div className="max-w-2xl">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest block mb-2">Privacy Shield Framework</span>
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              Designed for Absolute Privacy
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              We understand that camera-based monitoring is sensitive. AegisMind is built from the ground up to respect your boundaries. You are always in control of your data.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 border-t border-white/5 pt-8">
            {privacyLayers.map((layer, idx) => (
              <div key={idx} className="space-y-2">
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  {layer.level}
                </span>
                <h4 className="text-sm font-bold text-white pt-1">{layer.name}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{layer.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modes Section */}
      <section className="mx-auto max-w-5xl w-full py-16 border-t border-white/5 mb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Two Modes Engineered for POC Testing
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              {"To help you evaluate AegisMind's components and inference pipeline, we've separated the experience into two distinct environments. Switch between them instantly using the toggle in the navigation bar."}
            </p>

            <div className="mt-6 space-y-4 text-xs">
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 text-slate-400">1</div>
                <div>
                  <h4 className="font-bold text-white">Production Mode</h4>
                  <p className="text-slate-400 mt-0.5">A clean, distraction-free environment. Ideal for day-to-day studying, showing only your camera feed, active focus status, and a minimal layout.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5 text-cyan-400">2</div>
                <div>
                  <h4 className="font-bold text-white">Debug Mode</h4>
                  <p className="text-slate-400 mt-0.5">An interactive sandbox. Access raw facial coordinate readouts, FPS/latency stats, and manual state overrides (sliders) to test specific alerts and dashboard reactions.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-slate-900/10 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase">POC Quick Sandbox</span>
              <span className="text-[10px] text-cyan-400 animate-pulse font-mono font-bold">READY TO TEST</span>
            </div>
            
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-950 p-4 border border-white/5">
                <h4 className="text-xs font-bold text-white mb-2">Evaluate Right Now:</h4>
                <ol className="list-decimal list-inside space-y-2 text-[11px] text-slate-400">
                  <li>Navigate to the <Link href="/monitor" className="text-cyan-400 underline">Study Space</Link>.</li>
                  <li>Click <strong>Enable Camera</strong> and allow webcam access.</li>
                  <li>Toggle <strong>Debug Mode</strong> on in the top right.</li>
                  <li>Use the sliders to simulate high fatigue or high stress.</li>
                  <li>Watch the <Link href="/dashboard" className="text-cyan-400 underline">Analytics Dashboard</Link> map your metrics in real time!</li>
                </ol>
              </div>

              <Link
                href="/monitor"
                className="block text-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-3 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-400 transition-all"
              >
                Go to Study Space
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-white/5 py-8 text-center text-[11px] text-slate-600">
        <p>© 2026 AegisMind. Built as a high-fidelity mental state study companion POC.</p>
      </footer>
    </div>
  );
}
