"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "../../context/AppContext";

const navItems = [
  { name: "Home", path: "/app" },
  { name: "Study", path: "/app/study" },
  { name: "Focus", path: "/app/focus" },
  { name: "Dashboard", path: "/app/dashboard" },
  { name: "Settings", path: "/app/settings" },
];

export default function ProductNavbar() {
  const pathname = usePathname();
  const { isDebugMode, setIsDebugMode, isMonitoring } = useAppState();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/app" className="shrink-0 text-lg font-black tracking-tight text-white">
          Aegis<span className="font-light text-cyan-300">Mind</span>
        </Link>

        <nav className="hidden items-center gap-5 md:flex">
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== "/app" && pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`relative py-1 text-sm font-semibold transition-colors hover:text-white ${isActive ? "text-cyan-300" : "text-slate-400"}`}
              >
                {item.name}
                {isActive && <span className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-cyan-300" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
              isDebugMode
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            {isDebugMode ? "Debug Mode" : "Debug Off"}
          </button>
          <span className={`hidden rounded-full border px-3 py-1.5 text-xs font-semibold sm:inline-flex ${isMonitoring ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-slate-900 text-slate-400"}`}>
            {isMonitoring ? "Monitoring" : "Idle"}
          </span>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto border-t border-white/5 px-4 py-2 md:hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== "/app" && pathname.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isActive ? "bg-cyan-400 text-slate-950" : "bg-slate-900 text-slate-300"}`}>
              {item.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
