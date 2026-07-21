"use client";

import React, { useEffect, useRef } from "react";

export default function EndSessionDialog({ open, isEnding = false, onClose, onConfirm, onDiscard }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="end-session-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl">
        <h2 id="end-session-title" className="text-lg font-black">End this study session?</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Your collected data will be summarized and added to Session History.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button ref={cancelRef} type="button" onClick={onClose} disabled={isEnding} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 disabled:opacity-60">
            Continue Studying
          </button>
          <button type="button" onClick={onConfirm} disabled={isEnding} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-emerald-300 disabled:opacity-60">
            {isEnding ? "Ending..." : "End Session"}
          </button>
        </div>
        {onDiscard && (
          <button type="button" onClick={onDiscard} disabled={isEnding} className="mt-4 w-full rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs font-semibold text-red-300 transition-all hover:bg-red-500/10 disabled:opacity-60">
            Discard Session Instead
          </button>
        )}
      </section>
    </div>
  );
}
