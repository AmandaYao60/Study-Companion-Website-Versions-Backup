"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";

const features = [
  ["Local browser AI", "During camera-assisted study, MediaPipe and EmotiEffLib/ONNX process signals on your device to estimate attention, fatigue, valence, and arousal. Watch these cues as you study; camera images and face crops stay in your browser."],
  ["Study Space", "Start here to name your task, choose a session length, and complete an optional check-in. Once you enable the camera, follow your session timer and study-state feedback, pause when needed, and reflect before finishing."],
  ["Focus Space", "Enter Focus Space during a session for a calm forest backdrop with floating lights. Use the landmarks-only floating monitor, audio and fullscreen controls, and planned or suggested breaks while you work."],
  ["Analytics Dashboard", "Open View Live Analytics during a session to inspect current study-state data, or revisit locally saved Session History before or after studying. With no current session, the main Dashboard shows your latest completed session: choose Expand Analysis under Emotional Engagement, then hover over trajectory points to inspect valence and arousal."],
];

const showcases = [
  {
    title: "Study Space",
    body: "Prepare your task and optional check-in, then enable your camera to begin. Follow the timer, attention and fatigue cues, and session controls in one workspace. Open View Live Analytics whenever you want a closer look at your current session.",
    src: "/screenshots/study-space.png",
    width: 3072,
    height: 1728,
    alt: "Study workspace with session progress, pause and end controls, and a camera preview with face landmarks.",
  },
  {
    title: "Focus Space",
    body: "Move into a quiet forest scene with floating lights and a compact landmarks-only monitor. Keep your task and timer nearby, adjust audio, enter fullscreen, or take a planned or suggested break.",
    src: "/screenshots/focus-space.png",
    width: 3081,
    height: 1733,
    alt: "Forest focus environment with a session timer, break prompt, audio and fullscreen controls, and floating landmark monitor.",
  },
  {
    title: "Dashboard",
    body: "Inspect attention, fatigue, and affect charts during your session, then revisit reflections and locally saved Session History afterward. For the latest completed session on the main Dashboard, use Expand Analysis in Emotional Engagement and hover over trajectory points to see their valence and arousal values.",
    src: "/screenshots/dashboard.png",
    width: 3086,
    height: 1736,
    alt: "Analytics dashboard showing attention, fatigue, valence and arousal cards, behavioral trends, and an emotional engagement trajectory.",
  },
];

export default function LandingHero() {
  const isDebugAvailable = process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_MODE === "true";

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
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {features.map(([title, body]) => (
            <article key={title} className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/35 p-6">
              <h3 className="text-base font-bold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{body}</p>
            </article>
          ))}
        </div>

        {isDebugAvailable && (
          <aside aria-labelledby="technical-demo-title" className="mt-6 rounded-3xl border border-cyan-400/25 bg-cyan-400/5 p-6 sm:p-8">
            <h3 id="technical-demo-title" className="text-xl font-black text-cyan-200">Technical Demo</h3>
            <p className="mt-2 text-base font-semibold text-white">Explore the full workflow in a few minutes.</p>
            <ol className="mt-5 list-decimal space-y-4 pl-5 text-sm leading-relaxed text-slate-300 marker:font-bold marker:text-cyan-300">
              <li><strong className="text-white">Turn on Technical Demo.</strong> Open the study companion and switch Technical Demo to On in the upper-right navbar before starting a new session.</li>
              <li><strong className="text-white">Choose a short session.</strong> Select Start a New Study Session, enter a Task Name, then choose Custom under Target Duration. Set Custom seconds to 60 for a one-minute session. Complete or skip the optional check-in, then enable your camera when prompted to begin.</li>
              <li><strong className="text-white">See the system at work.</strong> After starting, open Diagnostics in the lower-right corner. System Status and Live Metrics show what the app is observing.</li>
              <li><strong className="text-white">Preview different study states.</strong> In Safe Simulation Controls, select Demo Simulation and try the presets or sliders. These previews do not change your saved session data. Select Live Input to return to live displays.</li>
              <li><strong className="text-white">Reflect and review.</strong> Use End Session when ready, complete or skip the reflection, and explore the Dashboard and Session History saved in this browser.</li>
            </ol>
            <Link href="/app" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">
              Open Study Companion
            </Link>
          </aside>
        )}
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-black text-white">How it works</h2>
        <div className="mt-8 space-y-10 sm:space-y-14">
          {showcases.map(({ title, body, src, width, height, alt }) => (
            <article key={title} className="mx-auto w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/35">
              <div className="p-5 sm:p-7">
                <h3 className="text-2xl font-black text-white">{title}</h3>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">{body}</p>
              </div>
              <figure>
                <Image
                  src={src}
                  alt={alt}
                  width={width}
                  height={height}
                  sizes="(max-width: 1279px) 100vw, 1216px"
                  className="h-auto w-full object-contain"
                />
                <figcaption className="border-t border-white/10 px-5 py-3 sm:px-7">
                  <a href={src} target="_blank" rel="noreferrer" className="text-xs font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-100">
                    Open full-size {title} screenshot
                  </a>
                </figcaption>
              </figure>
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
