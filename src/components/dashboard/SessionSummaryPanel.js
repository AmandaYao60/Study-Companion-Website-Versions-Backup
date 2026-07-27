"use client";

import React from "react";
import { selectSessionSummaryPresentation } from "../../services/session/index.js";

const evidenceTypeLabel = (type) => String(type || "evidence").replaceAll("-", " ");

export default function SessionSummaryPanel({ session, sourceLabel, variant = "default" }) {
  const presentation = selectSessionSummaryPresentation(session);
  const { sections } = presentation;
  const HeadingTag = variant === "modal" ? "h3" : "h2";
  const SectionHeadingTag = variant === "modal" ? "h4" : "h3";

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <HeadingTag className="text-sm font-bold uppercase tracking-wider text-white">
            {presentation.title}
          </HeadingTag>
          <p className="mt-1 text-xs text-slate-500">
            {presentation.subtitle}
          </p>
        </div>
        {sourceLabel ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-400">
            {sourceLabel}
          </span>
        ) : null}
      </div>

      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-5 text-sm text-slate-400">
          {presentation.emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sections.map(({ key, fallbackTitle, section }) => (
            <article key={key} className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">{fallbackTitle}</p>
              <SectionHeadingTag className="mt-2 text-sm font-bold text-white">{section.title}</SectionHeadingTag>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{section.message}</p>
              {Array.isArray(section.evidence) && section.evidence.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {section.evidence.map((item, index) => (
                    <li key={`${item.label || item.type || "evidence"}-${index}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-200">
                          {evidenceTypeLabel(item.type)}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {item.label}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-300">{item.message}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Confidence: {section.confidence}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
