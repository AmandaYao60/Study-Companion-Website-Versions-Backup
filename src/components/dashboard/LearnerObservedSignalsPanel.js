"use client";

import React from "react";
import { selectLearnerObservedSignalComparison } from "../../services/session/index.js";
import { formatCoverage, formatMetricUnit, formatMetricValue } from "./dashboardFormatters";

const formatLearnerRating = (value) => (Number.isInteger(value) ? `${value}/5` : null);

const formatModelValue = (value, valueKind) => {
  if (!Number.isFinite(value)) return null;
  return `${formatMetricValue(value, valueKind)}${formatMetricUnit(valueKind)}`;
};

function SignalValue({ title, label, scale, value, unavailableMessage }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/45 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{title}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      {value !== null ? (
        <p className="mt-1 break-words text-lg font-black text-white">{value}</p>
      ) : (
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{unavailableMessage}</p>
      )}
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{scale}</p>
    </div>
  );
}

export default function LearnerObservedSignalsPanel({ session, variant = "default" }) {
  const comparison = selectLearnerObservedSignalComparison(session);
  if (!comparison?.available) return null;

  const HeadingTag = variant === "modal" ? "h3" : "h2";
  const ConstructHeadingTag = variant === "modal" ? "h4" : "h3";
  const padding = variant === "modal" ? "p-4" : "p-5";

  return (
    <section className={`rounded-2xl border border-white/10 bg-slate-950/40 ${padding} shadow-2xl backdrop-blur-xl`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <HeadingTag className="text-sm font-bold uppercase tracking-wider text-white">
            Learner Report vs Model Observation
          </HeadingTag>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{comparison.note}</p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
            Learner reports describe subjective overall session experience. Model observations are estimates derived from available behavioral or facial signals; neither source is treated as objective ground truth, and repeated comparable sessions would be needed before discussing a recurring relationship.
          </p>
        </div>
        {Number.isFinite(comparison.dataCoverage) && (
          <span className="w-fit rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Data coverage: {formatCoverage(comparison.dataCoverage)}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {comparison.rows.map((row) => {
          const learnerValue = formatLearnerRating(row.learner.value);
          const modelValue = formatModelValue(row.model.value, row.model.valueKind);
          return (
            <article key={row.key} className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
              <ConstructHeadingTag className="text-sm font-bold text-white">{row.label}</ConstructHeadingTag>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <SignalValue
                  title="Learner report"
                  label={row.learner.label}
                  value={learnerValue}
                  scale={row.learner.scaleLabel}
                />
                <SignalValue
                  title="Model-estimated signal"
                  label={row.model.label}
                  value={modelValue}
                  scale={row.model.scaleLabel}
                  unavailableMessage={row.model.unavailableMessage}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">{row.note}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
