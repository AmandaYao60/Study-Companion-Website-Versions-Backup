"use client";

import React from "react";
import Link from "next/link";

const features = [
  ["Local browser AI", "MediaPipe and ONNX inference run in the browser during study sessions."],
  ["Study Space", "A clear camera and landmark view for standard monitoring and calibration."],
  ["Focus Space", "A calm fullscreen-ready stage with a landmarks-only floating monitor."],
  ["Analytics Dashboard", "Session charts, summaries, and history are available before Supabase is connected."],
];

const previews = [
  ["Study Space", "Camera preview, model status, session task, and supportive feedback."],
  ["Focus Space", "A placeholder visual stage for the future adaptive particle environment."],
  ["Dashboard", "Live and completed session views with behavioral and emotional charts."],
];

export default function LandingHero() {
  return (
    <div className="bg-slate-950">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">AI Study Companion</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">
            Study with a private, local AI companion.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            AegisMind helps students run focused study sessions, monitor attention and fatigue, and review completed sessions without uploading camera images or face crops.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="rounded-xl bg-cyan-400 px-5 py-3 text-center text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">
              Get Started
            </Link>
            <Link href="/login" className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-3 text-center text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800">
              Log In
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/35 p-5 shadow-2xl backdrop-blur-xl">
          <div className="rounded-2xl border border-cyan-400/20 bg-slate-950 p-4">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Product Preview</span>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">Local Demo</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3 aspect-[4/3] rounded-xl border border-white/10 bg-gradient-to-br from-cyan-400/15 via-slate-900 to-emerald-400/10" />
              <div className="col-span-2 space-y-3">
                <div className="h-16 rounded-xl border border-white/10 bg-slate-900" />
                <div className="h-16 rounded-xl border border-white/10 bg-slate-900" />
                <div className="h-16 rounded-xl border border-white/10 bg-slate-900" />
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full bg-cyan-300" />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-black text-white">Main features</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">The public site introduces the product. The actual study workflow lives inside the product area after demo entry.</p>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          {features.map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-slate-900/35 p-5">
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-black text-white">How it works</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {previews.map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-slate-900/35 p-5">
              <div className="mb-4 aspect-video rounded-xl border border-white/10 bg-slate-950" />
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="privacy" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Privacy and local processing</p>
          <h2 className="mt-3 text-3xl font-black text-white">Camera images stay local.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300">
            MediaPipe and EmotiEffLib ONNX inference run locally in the browser. The pre-Supabase product stores only study-session metadata, aggregated user-facing metrics, summaries, and chart samples in memory. Face images, crops, landmarks, tensors, and debug logs are not uploaded or stored.
          </p>
        </div>
      </section>
    </div>
  );
}
