"use client";

import React, { useState } from "react";
import { formatCoverage, formatDuration, formatMetricUnit, formatMetricValue } from "./dashboardFormatters";

const chartWidth = 680;
const chartHeight = 260;
const chartPadding = { top: 24, right: 20, bottom: 42, left: 48 };
const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const sourceBadgeClass = {
  "Session record": "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  "Learner report": "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  "Model observation": "border-sky-400/20 bg-sky-400/10 text-sky-200",
  "Data limitation": "border-amber-300/20 bg-amber-300/10 text-amber-100",
};

const formatCount = (count, noun = "Session") => `${count} ${noun}${count === 1 ? "" : "s"}`;
const formatMaybeDuration = (value) => (isFiniteNumber(value) ? formatDuration(value) : "Unavailable");
const formatRating = (value) => (isFiniteNumber(value) ? `${Number.isInteger(value) ? value : value.toFixed(1)}/5` : "Unavailable");
const formatDateOnly = (value) => {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const formatModel = (value, valueKind) => {
  if (!isFiniteNumber(value)) return "Unavailable";
  return `${formatMetricValue(value, valueKind)}${formatMetricUnit(valueKind)}`;
};

function SourceBadge({ label }) {
  return (
    <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sourceBadgeClass[label] || "border-white/10 bg-slate-900 text-slate-300"}`}>
      {label}
    </span>
  );
}

function OverviewCard({ label, value, detail, source = "Session record" }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/45 p-4">
      <SourceBadge label={source} />
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-black text-white">{value}</p>
      {detail ? <p className="mt-2 text-xs leading-relaxed text-slate-400">{detail}</p> : null}
    </div>
  );
}

function BreakdownSection({ title, subtitle, breakdown, source = "Session record" }) {
  const rows = breakdown?.rows || [];
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">No recorded values are available for this breakdown.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
        <SourceBadge label={source} />
      </div>
      {breakdown.mostFrequent ? (
        <p className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs leading-relaxed text-slate-300">
          Most frequently recorded: <span className="font-semibold text-white">{breakdown.mostFrequent.label}</span> across {formatCount(breakdown.mostFrequent.sessionCount)}.
        </p>
      ) : (
        <p className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs leading-relaxed text-slate-400">
          Counts are shown descriptively. Tied categories are left as counts rather than naming one category.
        </p>
      )}
      <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_7rem] gap-2 bg-slate-950/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>Recorded value</span>
          <span className="text-right">Sessions</span>
          <span className="text-right">Duration</span>
        </div>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_7rem] gap-2 border-t border-white/10 px-3 py-2 text-xs text-slate-300">
            <span className="min-w-0 break-words">{row.label}</span>
            <span className="text-right font-semibold text-white">{row.sessionCount}</span>
            <span className="text-right">{formatMaybeDuration(row.totalRecordedDuration)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricSelector({ metrics, selectedKey, onSelect }) {
  if (metrics.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose metric to chart">
      {metrics.map((metric) => {
        const selected = metric.key === selectedKey;
        return (
          <button
            key={metric.key}
            type="button"
            onClick={() => onSelect(metric.key)}
            className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/50 ${
              selected
                ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
                : "border-white/10 bg-slate-900 text-slate-400 hover:bg-slate-800"
            }`}
            aria-pressed={selected}
          >
            {metric.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricLineChart({ metric, valueFormatter, yMin, yMax, yLabel }) {
  const series = metric?.series || [];
  const points = series.map((point, index) => {
    const x = series.length <= 1
      ? chartPadding.left + plotWidth / 2
      : chartPadding.left + (index / (series.length - 1)) * plotWidth;
    const ratio = (point.value - yMin) / (yMax - yMin || 1);
    const y = chartPadding.top + (1 - Math.min(1, Math.max(0, ratio))) * plotHeight;
    return { ...point, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const yTicks = yMin === 1 ? [1, 2, 3, 4, 5] : yMin === -1 ? [-1, -0.5, 0, 0.5, 1] : [0, 25, 50, 75, 100];

  if (!metric || series.length === 0) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/50 p-4 text-center text-sm text-slate-400">
        This metric has enough responses for an aggregate, but not enough valid timestamps for a chronological chart.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full min-h-64 w-full" role="img" aria-label={`${metric.label} chronological history chart`}>
      <rect width={chartWidth} height={chartHeight} fill="transparent" />
      {yTicks.map((tick) => {
        const y = chartPadding.top + (1 - ((tick - yMin) / (yMax - yMin || 1))) * plotHeight;
        return (
          <g key={tick}>
            <line x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} stroke="rgba(148,163,184,0.12)" />
            <text x={chartPadding.left - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{tick}</text>
          </g>
        );
      })}
      {points.map((point) => (
        <g key={`${point.sessionId}-tick`}>
          <line x1={point.x} x2={point.x} y1={chartPadding.top} y2={chartHeight - chartPadding.bottom} stroke="rgba(148,163,184,0.08)" />
          <text x={point.x} y={chartHeight - 16} textAnchor="middle" className="fill-slate-500 text-[10px]">{point.dateLabel}</text>
        </g>
      ))}
      {points.length > 1 ? (
        <path d={path} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {points.map((point) => (
        <circle key={point.sessionId} cx={point.x} cy={point.y} r="5" fill="#22d3ee" tabIndex={0} aria-label={`${metric.label}, ${point.dateLabel}, ${valueFormatter(point.value)}`}>
          <title>{`${metric.label}: ${valueFormatter(point.value)}. Source: ${point.source}. Session: ${point.dateLabel}${isFiniteNumber(point.dataCoverage) ? `. Data coverage: ${formatCoverage(point.dataCoverage)}` : point.dataCoverage === null ? ". Data coverage: unknown" : ""}.`}</title>
        </circle>
      ))}
      <text x={14} y={chartHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${chartHeight / 2})`} className="fill-slate-400 text-[11px]">{yLabel}</text>
    </svg>
  );
}

function LearnerHistory({ learnerReported }) {
  const metrics = learnerReported.metrics || [];
  const [selectedKey, setSelectedKey] = useState(metrics[0]?.key || null);
  const selectedMetric = metrics.find((metric) => metric.key === selectedKey) || metrics[0] || null;

  if (metrics.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
        <SourceBadge label="Learner report" />
        <h3 className="mt-3 text-sm font-bold text-white">Learner-reported History</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          No learner-reported metric has at least three valid responses yet. Missing ratings are not filled with zero.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SourceBadge label="Learner report" />
          <h3 className="mt-3 text-sm font-bold text-white">Learner-reported History</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Ratings remain on the original 1-5 learner-report scale and are summarized with medians.
          </p>
        </div>
        <MetricSelector metrics={metrics} selectedKey={selectedMetric?.key} onSelect={setSelectedKey} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{selectedMetric.label}</p>
          <p className="mt-2 text-2xl font-black text-white">{formatRating(selectedMetric.medianRating)}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Median across {selectedMetric.responseCount} learner response{selectedMetric.responseCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{selectedMetric.scaleLabel}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <MetricLineChart metric={selectedMetric} valueFormatter={formatRating} yMin={1} yMax={5} yLabel="1-5 rating" />
        </div>
      </div>
    </section>
  );
}

function ModelHistory({ modelObserved }) {
  const metrics = modelObserved.metrics || [];
  const [selectedKey, setSelectedKey] = useState(metrics[0]?.key || null);
  const selectedMetric = metrics.find((metric) => metric.key === selectedKey) || metrics[0] || null;

  if (metrics.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
        <SourceBadge label="Model observation" />
        <h3 className="mt-3 text-sm font-bold text-white">Model-observed History</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          No model-observation metric has at least three completed Sessions with usable persisted statistics yet.
        </p>
        {modelObserved.coverage?.limitation ? (
          <p className="mt-3 text-xs leading-relaxed text-amber-100">{modelObserved.coverage.limitation}</p>
        ) : null}
      </section>
    );
  }

  const yMin = selectedMetric.valueKind === "affect" ? -1 : 0;
  const yMax = selectedMetric.valueKind === "affect" ? 1 : 100;

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SourceBadge label="Model observation" />
          <h3 className="mt-3 text-sm font-bold text-white">Model-observed History</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Values come from persisted full-session statistics. Each Session contributes at most one valid mean per metric.
          </p>
        </div>
        <MetricSelector metrics={metrics} selectedKey={selectedMetric?.key} onSelect={setSelectedKey} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{selectedMetric.label}</p>
          <p className="mt-2 text-2xl font-black text-white">{formatModel(selectedMetric.meanValue, selectedMetric.valueKind)}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Mean across {formatCount(selectedMetric.sessionCount)} with usable persisted statistics.
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{selectedMetric.scaleLabel}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <MetricLineChart
            metric={selectedMetric}
            valueFormatter={(value) => formatModel(value, selectedMetric.valueKind)}
            yMin={yMin}
            yMax={yMax}
            yLabel={selectedMetric.valueKind === "affect" ? "-1 to 1" : "0-100"}
          />
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Coverage known for {formatCount(modelObserved.coverage.knownCount)}, unknown for {formatCount(modelObserved.coverage.unknownCount)}, and zero for {formatCount(modelObserved.coverage.zeroCoverageCount)}. Zero-coverage Sessions do not contribute model metric values.
      </p>
    </section>
  );
}

export default function LongTermPatternsPanel({ model }) {
  if (!model) return null;

  const { eligibility, overview } = model;
  const historyStatus = model.status === "empty"
    ? "No completed Sessions are available yet."
    : model.status === "building"
      ? `Building history: ${formatCount(eligibility.completedSessionCount)} recorded. Long-term Patterns need at least ${eligibility.minimumSessionCount}.`
      : `Based on ${formatCount(eligibility.completedSessionCount)}.`;
  const dateRange = overview.dateRange
    ? `${formatDateOnly(overview.dateRange.start)} to ${formatDateOnly(overview.dateRange.end)}`
    : "Unavailable";

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Long-term Patterns</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Descriptive history from completed Session records, learner reports, and model observations.
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {historyStatus}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
        <SourceBadge label="Data limitation" />
        <p className="mt-2 text-xs leading-relaxed text-amber-50">
          This view summarizes available completed Session records and may be affected by missing or incomplete data. It does not establish causality, diagnose the learner, predict future performance, or identify a universally best study method or time.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          label="Completed Sessions"
          value={String(eligibility.completedSessionCount)}
          detail={`Minimum for longitudinal view: ${eligibility.minimumSessionCount}.`}
        />
        <OverviewCard
          label="Total recorded duration"
          value={formatMaybeDuration(overview.totalStudyDuration)}
          detail={`${overview.sessionsWithValidDuration} completed Session${overview.sessionsWithValidDuration === 1 ? "" : "s"} contributed valid recorded duration.`}
        />
        <OverviewCard
          label="Median Session duration"
          value={formatMaybeDuration(overview.medianSessionDuration)}
          detail="Median uses valid recorded actual durations only."
        />
        <OverviewCard
          label="Date range"
          value={dateRange}
          detail={overview.dateRange ? `${overview.dateRange.sessionCount} Session start timestamp${overview.dateRange.sessionCount === 1 ? "" : "s"} contributed.` : "Invalid or missing timestamps are not placed on an invented date."}
        />
      </div>

      {model.status === "empty" ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-5 text-sm text-slate-400">
          Complete study Sessions to begin building this history.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <BreakdownSection
              title="Recorded Subjects"
              subtitle="Most frequently recorded is only a count of available records."
              breakdown={model.contextBreakdowns.subjects}
            />
            <BreakdownSection
              title="Recorded Task Types"
              subtitle="Counts summarize what was recorded, not task effectiveness."
              breakdown={model.contextBreakdowns.taskTypes}
            />
            <BreakdownSection
              title="Recorded Session Timing"
              subtitle="Dayparts use the app's current local-time interpretation of Session start timestamps."
              breakdown={model.contextBreakdowns.dayparts}
            />
            <BreakdownSection
              title="Learner-reported Primary Strategies"
              subtitle="Strategy rows use learner-reported selections and do not compare outcomes across strategies."
              breakdown={model.contextBreakdowns.primaryStrategies}
              source="Learner report"
            />
          </div>

          <div className="mt-4 space-y-4">
            <LearnerHistory learnerReported={model.learnerReported} />
            <ModelHistory modelObserved={model.modelObserved} />
          </div>
        </>
      )}

      {model.limitations.length > 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/35 p-4">
          <SourceBadge label="Data limitation" />
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-400">
            {model.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
