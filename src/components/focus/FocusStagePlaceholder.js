"use client";

import React from "react";
import FloatingLightsCanvas from "./FloatingLightsCanvas";

export default function FocusStagePlaceholder({ stageRef, isBreakMode = false, children }) {
  return (
    <section
      ref={stageRef}
      className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 text-white [&:fullscreen]:h-screen [&:fullscreen]:min-h-screen [&:fullscreen]:w-screen"
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{backgroundImage: "url('/background/fantasy-forest.png')",}}
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-0 bg-slate-950/10"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(2,6,23,0.34)_100%)]"
        aria-hidden="true"
      />

      <FloatingLightsCanvas
        particleCount={80}
        intensity={1.25}
        speedMultiplier={0.7}
        className="z-10"
      />

      {isBreakMode && <div className="absolute inset-0 z-15 bg-slate-950/55 backdrop-brightness-50" aria-hidden="true" />}


       <div className="relative z-20 min-h-[inherit]">
        {children}
      </div>

    </section>
  );
}
