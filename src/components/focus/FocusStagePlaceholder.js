"use client";

import React from "react";

export default function FocusStagePlaceholder({ stageRef, isBreakMode = false, children }) {
  return (
    <section
      ref={stageRef}
      className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 text-white [&:fullscreen]:h-screen [&:fullscreen]:min-h-screen [&:fullscreen]:w-screen"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_78%_24%,rgba(59,130,246,0.16),transparent_30%),linear-gradient(135deg,#020617_0%,#08111f_42%,#020617_100%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(148,163,184,0.32)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
      {isBreakMode && <div className="absolute inset-0 z-10 bg-slate-950/55 backdrop-brightness-50" aria-hidden="true" />}

      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center ${isBreakMode ? "z-20 opacity-55" : ""}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.38em] text-cyan-300/80">
            Adaptive Particle Environment
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">
            Visual prototype coming next
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
            Phase 2 begins with a lightweight stage shell while the browser-local inference pipeline remains unchanged.
          </p>
        </div>
      </div>

      {children}
    </section>
  );
}
