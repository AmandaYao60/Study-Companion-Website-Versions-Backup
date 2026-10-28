"use client";

import React from "react";
import Link from "next/link";

export default function PublicNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-black tracking-tight text-white">
          Aegis<span className="font-light text-cyan-300">Mind</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-400 md:flex">
          <Link href="/#features" className="transition-colors hover:text-white">Features</Link>
          <Link href="/#how-it-works" className="transition-colors hover:text-white">How It Works</Link>
          <Link href="/#privacy" className="transition-colors hover:text-white">Privacy</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/app" className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 transition-all hover:bg-cyan-300">
            Explore Demo
          </Link>
        </div>
      </div>
    </header>
  );
}
