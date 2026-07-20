"use client";

import React, { useState } from "react";

const ranges = ["1 Week", "1 Month", "6 Months", "1 Year"];

export default function LongTermTrendsPlaceholder() {
  const [selectedRange, setSelectedRange] = useState(ranges[0]);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Long-Term Trends</h2>
          <p className="mt-1 text-xs text-slate-500">Prepared for future persistent summary queries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ranges.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setSelectedRange(range)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                selectedRange === range
                  ? "bg-cyan-500 text-slate-950"
                  : "border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-6 text-sm text-slate-400">
        Long-term trend analysis will become available after persistent session storage is connected.
      </div>
    </section>
  );
}
