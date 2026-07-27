"use client";

import React from "react";
import {
  formatLearningActivityLabel,
  formatStrategyLabel,
  selectSessionSelfReportAnalysis,
} from "../../services/session/index.js";
import { formatDuration, formatTargetDuration, formatTask } from "./dashboardFormatters";

const isProvided = (value) => (
  value !== null
  && value !== undefined
  && value !== ""
  && !(Array.isArray(value) && value.length === 0)
);

const formatRating = (value) => (Number.isInteger(value) ? `${value}/5` : null);

const formatValue = (item) => {
  if (!item) return null;
  if (item.valueKind === "rating") return formatRating(item.value);
  if (item.valueKind === "duration") return formatDuration(item.value);
  if (item.valueKind === "targetDuration") return formatTargetDuration(item.value);
  if (item.valueKind === "strategy") return formatStrategyLabel(item.value);
  if (item.valueKind === "learningActivity") return formatLearningActivityLabel(item.value);
  if (item.valueKind === "strategyList") {
    return item.value
      .map(formatStrategyLabel)
      .filter((label) => label !== "Not provided")
      .join(", ");
  }
  return String(item.value);
};

function Section({ title, subtitle, children, variant = "default" }) {
  const padding = variant === "modal" ? "p-4" : "p-5";
  const HeadingTag = variant === "modal" ? "h3" : "h2";
  return (
    <section className={`rounded-2xl border border-white/10 bg-slate-950/40 ${padding} shadow-2xl backdrop-blur-xl`}>
      <HeadingTag className="text-sm font-bold uppercase tracking-wider text-white">{title}</HeadingTag>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function EmptyState({ children }) {
  return (
    <p className="rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-4 text-sm leading-relaxed text-slate-400">
      {children}
    </p>
  );
}

function FieldCard({ item, highlight = false }) {
  const value = formatValue(item);
  if (!isProvided(value) || value === "Not provided") return null;
  const valueClass = item.valueKind === "longText"
    ? "whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100"
    : "break-words text-sm font-semibold text-slate-100";
  const tone = highlight ? "border-cyan-300/30 bg-cyan-400/10" : "border-white/10 bg-slate-900/45";

  return (
    <div className={`rounded-xl border ${tone} p-3`}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
      <p className={`mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

function FieldGrid({ items, highlightKeys = [] }) {
  const visibleItems = items.filter((item) => {
    const value = formatValue(item);
    return isProvided(value) && value !== "Not provided";
  });
  if (visibleItems.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibleItems.map((item) => (
        <FieldCard key={item.key} item={item} highlight={highlightKeys.includes(item.key)} />
      ))}
    </div>
  );
}

function RatingPair({ title, before, overall }) {
  if (!Number.isInteger(before) && !Number.isInteger(overall)) return null;
  const columns = Number.isInteger(before) && Number.isInteger(overall) ? "sm:grid-cols-2" : "sm:grid-cols-1";
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/45 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <div className={`mt-3 grid grid-cols-1 gap-3 ${columns}`}>
        {Number.isInteger(before) && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Before session</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{formatRating(before)}</p>
          </div>
        )}
        {Number.isInteger(overall) && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Overall session experience</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{formatRating(overall)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Insight({ title, children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm leading-relaxed text-slate-200">
      {title && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">{title}</p>}
      {children}
    </div>
  );
}

export default function SessionSelfReportPanel({ session, variant = "default" }) {
  const analysis = selectSessionSelfReportAnalysis(session);
  if (!analysis) return null;

  const difficulty = analysis.expectationExperience.difficulty;
  const confidenceGoal = analysis.expectationExperience.confidenceGoal;
  const contextItems = analysis.goalOutcome.contextItems.map((item) => (
    item.key === "taskName" ? { ...item, value: formatTask(item.value) } : item
  ));

  return (
    <div className="space-y-4">
      <Section
        title="Session Goal & Outcome"
        subtitle={analysis.isCompleted
          ? "Task context and learner-reported goal outcome for this completed session."
          : "Current task context and available initial check-in details for this session."}
        variant={variant}
      >
        <FieldGrid items={[...contextItems, ...analysis.goalOutcome.outcomeItems]} />
        {analysis.goalOutcome.postUnavailableMessage && (
          <EmptyState>{analysis.goalOutcome.postUnavailableMessage}</EmptyState>
        )}
        {analysis.goalOutcome.currentSessionMessage && (
          <EmptyState>{analysis.goalOutcome.currentSessionMessage}</EmptyState>
        )}
      </Section>

      {!analysis.isCompleted && (
        <Section
          title="Initial Check-in"
          subtitle="Self-reported before-session context. Missing answers are left blank."
          variant={variant}
        >
          {analysis.initialCheckIn.available ? (
            <FieldGrid items={analysis.initialCheckIn.items} />
          ) : (
            <EmptyState>{analysis.initialCheckIn.unavailableMessage}</EmptyState>
          )}
        </Section>
      )}

      {analysis.isCompleted && analysis.expectationExperience.available && (
        <Section
          title="Expectation vs Experience"
          subtitle="Before-session ratings and overall session experience describe different moments and should not be read as equivalent pre-test and post-test measurements."
          variant={variant}
        >
          <FieldGrid
            items={[
              { key: "expectedDifficulty", label: "Expected difficulty", value: difficulty.expected, valueKind: "rating" },
              { key: "perceivedDifficulty", label: "Perceived difficulty", value: difficulty.perceived, valueKind: "rating" },
            ]}
          />
          {difficulty.comparison && (
            <Insight title="Difficulty context">
              <p>{difficulty.comparison.description}</p>
              <p className="mt-2 text-slate-400">{difficulty.comparison.caution}</p>
            </Insight>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <RatingPair
              title="Mood"
              before={analysis.expectationExperience.mood.beforeSession}
              overall={analysis.expectationExperience.mood.overallSessionExperience}
            />
            <RatingPair
              title="Energy"
              before={analysis.expectationExperience.energy.beforeSession}
              overall={analysis.expectationExperience.energy.overallSessionExperience}
            />
          </div>
          {confidenceGoal.context && (
            <Insight title="Confidence and goal attainment">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <p><span className="font-semibold text-slate-100">Initial confidence:</span> {formatRating(confidenceGoal.initialConfidence)}</p>
                <p><span className="font-semibold text-slate-100">Goal attainment - learner-reported:</span> {formatRating(confidenceGoal.goalAttainment)}</p>
              </div>
              <p className="mt-2 text-slate-400">{confidenceGoal.context}</p>
            </Insight>
          )}
        </Section>
      )}

      {analysis.isCompleted && analysis.motivationalContext.available && (
        <Section
          title="Motivational Context"
          subtitle="Initial appraisals from the pre-session check-in."
          variant={variant}
        >
          <FieldGrid items={analysis.motivationalContext.items} />
          <Insight>{analysis.motivationalContext.context}</Insight>
        </Section>
      )}

      {analysis.isCompleted && analysis.learningStrategy.available && (
        <Section
          title="Learning Strategy & Reflection"
          subtitle="Strategy and activity labels are self-reported by the learner, not camera-detected learning scores."
          variant={variant}
        >
          <FieldGrid items={analysis.learningStrategy.items} highlightKeys={["primaryStrategy"]} />
          {analysis.learningStrategy.note && <Insight>{analysis.learningStrategy.note}</Insight>}
        </Section>
      )}
    </div>
  );
}
