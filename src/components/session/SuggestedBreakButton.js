"use client";

import React from "react";

export default function SuggestedBreakButton({
  onClick,
  disabled = false,
  fullWidth = false,
  className = "",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Start a suggested break"
      className={`suggested-break-pulse inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-3 py-2 text-xs font-bold text-cyan-100 shadow-lg shadow-cyan-950/20 transition-all hover:bg-cyan-300/25 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${fullWidth ? "w-full justify-center px-4 py-3 text-sm" : ""} ${className}`}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Start a Break
    </button>
  );
}
