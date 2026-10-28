"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";

const features = [
  ["Local browser AI", "On-device affective computing with MediaPipe and EmotiEffLib/ONNX runs in your browser."],
  ["Study Space", "Set a study task, reflect before and after each session, and monitor attention and fatigue cues."],
  ["Focus Space", "A calm visual environment with floating lights, fullscreen controls, a landmarks-only monitor, and break support."],
  ["Analytics Dashboard", "Review session charts, summaries, and history saved locally in your browser."],
];

const previews = [
  ["Study Space", "Choose a task, complete an optional check-in, and begin a camera-assisted study session."],
  ["Focus Space", "Study with a forest backdrop and floating lights, session controls, and planned or suggested breaks."],
  ["Dashboard", "Reflect after studying, then review session metrics and locally saved history."],
];

export default function LandingHero() {
  return (
    <div className="bg-slate-950">
      <section className="relative isolate overflow-hidden border-b border-white/5">
        {/* Hero background image */}
        <Image
          aria-hidden="true"
          src="/background/glowing-flowers.png"
          alt=""
          width={1456}
          height={816}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover object-[68%_center] brightness-[0.82] saturate-[0.92] lg:object-center"
        />

        {/* Slight overall darkening for text and preview readability */}
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 bg-slate-950/10"
        />


        <div className="relative z-20 mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
              AI Study Companion
            </p>

            <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">
              Study with an AI companion.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              AegisMind helps students run focused study sessions, monitor attention and fatigue cues,
              and review completed sessions without uploading camera images or face crops.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/app"
                className="rounded-xl bg-cyan-400 px-5 py-3 text-center text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300"
              >
                Explore Demo
              </Link>

              <Link
                href="#features"
                className="rounded-xl border border-white/15 bg-slate-950/55 px-5 py-3 text-center text-sm font-semibold text-slate-200 backdrop-blur-md transition-all hover:bg-slate-900/80"
              >
                See Features
              </Link>
            </div>

          </div>
        </div>

        {/* Transparent foreground vegetation */}
        <Image
          aria-hidden="true"
          src="/background/glowing-flowers-front.png"
          alt=""
          width={1456}
          height={816}
          className="pointer-events-none absolute inset-0 z-30 h-full w-full select-none object-cover object-[68%_center] lg:object-center"
        />
        
        {/* Small transition only at the bottom */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-24 bg-linear-to-b from-transparent to-slate-950/80"
        />
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-black text-white">Main features</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">Plan a focused study session, take breaks, and reflect on your progress. No account is required.</p>
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
        <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/4 p-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Privacy and local processing</p>
          <h2 className="mt-3 text-3xl font-black text-white">Camera images stay local.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300">
            Camera-based MediaPipe and EmotiEffLib/ONNX inference runs locally in your browser. Facial images and crops are not uploaded or saved. Completed study-session records, reflections, summaries, and metric samples are saved locally in this browser via IndexedDB. There is no cloud synchronization or account-based storage; clearing site data removes local history.
          </p>
        </div>
      </section>
    </div>
  );
}
