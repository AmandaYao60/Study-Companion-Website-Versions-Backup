"use client";

import React from "react";
import { useAppState } from "../../context/AppContext";
import SessionSetupForm from "../../components/product/SessionSetupForm";
import ActiveSessionCard from "../../components/product/ActiveSessionCard";

export default function ProductHomePage() {
  const { activeSession } = useAppState();

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
      <div className="space-y-4">
        {activeSession ? <ActiveSessionCard /> : <SessionSetupForm />}
      </div>
      <aside className="rounded-3xl border border-white/10 bg-slate-950/40 p-6 shadow-2xl backdrop-blur-xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Product Home</p>
        <h2 className="mt-3 text-2xl font-black text-white">One session, three spaces.</h2>
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4"><h3 className="text-sm font-bold text-white">Study</h3><p className="mt-1 text-xs text-slate-400">Standard camera, landmark, and model status view.</p></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4"><h3 className="text-sm font-bold text-white">Focus</h3><p className="mt-1 text-xs text-slate-400">Optional immersive placeholder with landmarks-only monitoring.</p></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-4"><h3 className="text-sm font-bold text-white">Dashboard</h3><p className="mt-1 text-xs text-slate-400">Live provisional analytics and completed session history.</p></div>
        </div>
      </aside>
    </div>
  );
}
