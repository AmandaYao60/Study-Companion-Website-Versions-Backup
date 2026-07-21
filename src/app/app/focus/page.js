"use client";

import React from "react";
import Link from "next/link";
import { useAppState } from "../../../context/AppContext";
import FocusSpace from "../../../components/focus/FocusSpace";

export default function ProductFocusPage() {
  const { activeSession, isMonitoring } = useAppState();

  if (!activeSession) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-12 sm:px-6 lg:px-8">
        <section className="w-full rounded-3xl border border-white/10 bg-slate-950/50 p-8 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Focus Space</p>
          <h1 className="mt-3 text-3xl font-black text-white">Start a session first.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">Focus Space reuses the active study session and camera pipeline. Create a session from Product Home before entering Focus Space.</p>
          <Link href="/app" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">Go to Session Setup</Link>
        </section>
      </div>
    );
  }

  if (!isMonitoring) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-12 sm:px-6 lg:px-8">
        <section className="w-full rounded-3xl border border-white/10 bg-slate-950/50 p-8 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Focus Space</p>
          <h1 className="mt-3 text-3xl font-black text-white">Resume monitoring first.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">The landmarks-only Focus panel appears when monitoring is active. Use the global session bar to resume, then return here.</p>
          <Link href="/app/study" className="mt-6 inline-flex rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-200 transition-all hover:bg-cyan-400/20">Return to Study Space</Link>
        </section>
      </div>
    );
  }

  return <FocusSpace />;
}
