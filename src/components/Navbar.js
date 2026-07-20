"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "../context/AppContext";

export default function Navbar() {
  const pathname = usePathname();
  const { isDebugMode, setIsDebugMode, isMonitoring } = useAppState();

  const navItems = [
    { name: "Overview", path: "/" },
    { name: "Study Space", path: "/monitor" },
    { name: "Focus Space", path: "/focus" },
    { name: "Analytics", path: "/dashboard" }
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 p-0.5 shadow-lg shadow-cyan-500/20">
            <span className="text-base font-black text-white">Ω</span>
            {isMonitoring && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              </span>
            )}
          </div>
          <Link href="/" className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-lg font-bold tracking-tight text-transparent">
            Aegis<span className="text-cyan-400 font-light">Mind</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`relative py-1 text-sm font-medium transition-colors hover:text-white ${
                  isActive ? "text-cyan-400 font-semibold" : "text-slate-400"
                }`}
              >
                {item.name}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_1px_8px_rgba(34,211,238,0.4)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Mode Switcher & Actions */}
        <div className="flex items-center gap-4">
          {/* Debug Mode Toggle */}
          <button
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 border ${
              isDebugMode
                ? "bg-cyan-500/10 border-cyan-400/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                : "bg-slate-900 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isDebugMode ? "bg-cyan-400 animate-pulse" : "bg-slate-600"}`} />
            {isDebugMode ? "Debug Mode" : "Production Mode"}
          </button>

          {/* Quick status indicator */}
          <div className="hidden sm:flex items-center gap-2 text-xs border border-white/5 bg-slate-900/50 rounded-full px-3 py-1.5">
            <span className="text-slate-500">Status:</span>
            <span className={`font-medium ${isMonitoring ? "text-emerald-400" : "text-amber-400"}`}>
              {isMonitoring ? "Monitoring" : "Idle"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
