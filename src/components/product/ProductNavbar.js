"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "../../context/AppContext";

const iconButtonClass = (isActive) => `inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all ${
  isActive
    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
    : "border-white/10 bg-slate-900 text-slate-400 hover:border-white/20 hover:text-white"
}`;

export default function ProductNavbar() {
  const pathname = usePathname();
  const { isDebugMode, setIsDebugMode } = useAppState();
  const isDashboard = pathname.startsWith("/app/dashboard");
  const isSettings = pathname.startsWith("/app/settings");
  const isAccount = pathname.startsWith("/app/account");

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/app" aria-label="Return to Study Workspace" className="shrink-0 text-lg font-black tracking-tight text-white transition-colors hover:text-cyan-100">
          Aegis<span className="font-light text-cyan-300">Mind</span>
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <Link
            href="/app/dashboard"
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all sm:px-4 ${
              isDashboard
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 bg-slate-900 text-slate-300 hover:border-cyan-400/30 hover:text-cyan-100"
            }`}
          >
            <span className="hidden sm:inline">View Live Analytics</span>
            <span className="sm:hidden">Analytics</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all ${
              isDebugMode
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            <span className="hidden sm:inline">{isDebugMode ? "Debug On" : "Debug Off"}</span>
            <span className="sm:hidden">{isDebugMode ? "Debug On" : "Debug Off"}</span>
          </button>

          <Link href="/app/settings" aria-label="Open settings" title="Settings" className={iconButtonClass(isSettings)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.5 6h3m-8.2 8.7 2.1 2.1m9.2-9.2 2.1-2.1M4 12h3m10 0h3m-3.4 4.8 2.1 2.1M5.3 5.3l2.1 2.1M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
            </svg>
          </Link>

          <Link href="/app/account" aria-label="Open account" title="Account" className={iconButtonClass(isAccount)}>
            <span aria-hidden="true">AF</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
