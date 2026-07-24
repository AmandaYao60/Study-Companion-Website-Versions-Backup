"use client";

import React from "react";
import {
  formatLearningActivityLabel,
  formatStrategyLabel,
  formatSubjectLabel,
  formatTaskTypeLabel,
} from "../../services/session/index.js";
import { formatDuration, formatTargetDuration, formatTask } from "./dashboardFormatters";

const isProvided = (value) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
const rating = (value) => Number.isInteger(value) ? `${value}/5` : null;
const subjectLabel = (session) => session?.subject === "other"
  ? session.customSubject || "Other"
  : formatSubjectLabel(session?.subject);
const taskTypeLabel = (session) => session?.taskType === "other"
  ? session.customTaskType || "Other"
  : formatTaskTypeLabel(session?.taskType);

function DetailGroup({ title, subtitle, rows }) {
  const visibleRows = rows.filter(([, value]) => isProvided(value) && value !== "Not provided");
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-2xl backdrop-blur-xl">
      <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      {visibleRows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-slate-900/30 p-4 text-sm text-slate-400">Not provided</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-slate-900/45 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function SessionSelfReportPanel({ session }) {
  if (!session) return null;
  const pre = session.preSessionCheckIn || {};
  const post = session.postSessionCheckOut || {};
  const strategies = Array.isArray(post.strategiesUsed) ? post.strategiesUsed : [];

  return (
    <div className="space-y-4">
      <DetailGroup
        title="Session Details"
        rows={[
          ["Task Name", formatTask(session.taskName || session.taskDescription)],
          ["Target Duration", formatTargetDuration(session.targetDurationMs)],
          ["Actual Duration", formatDuration(session.actualDurationMs ?? session.accumulatedStudyMs)],
          ["Subject", subjectLabel(session)],
          ["Task Type", taskTypeLabel(session)],
          ["Session Goal", session.sessionGoal],
        ]}
      />
      <DetailGroup
        title="Initial Check-in"
        subtitle="Self-reported before-session context. Missing answers are left blank."
        rows={[
          ["Expected Difficulty", rating(pre.expectedDifficulty)],
          ["Task Confidence", rating(pre.taskConfidence)],
          ["Initial Mood", rating(pre.mood)],
          ["Initial Energy", rating(pre.energy)],
          ["Task Value", rating(pre.taskValue)],
        ]}
      />
      <DetailGroup
        title="Overall Session Experience"
        subtitle="Initial state and overall session experience are not interpreted as direct improvement scores."
        rows={[
          ["Session Energy", rating(post.sessionEnergy)],
          ["Session Mood", rating(post.sessionMood)],
          ["Perceived Fatigue - self-reported", rating(post.perceivedFatigue)],
          ["Perceived Attention - self-reported", rating(post.perceivedAttention)],
          ["Perceived Difficulty", rating(post.perceivedDifficulty)],
          ["Goal Attainment", rating(post.goalAttainment)],
        ]}
      />
      <DetailGroup
        title="Learning Strategy and Reflection"
        subtitle="Reported learning activity is self-reported and is not a learning score."
        rows={[
          ["Strategies Used", strategies.map(formatStrategyLabel).join(", ") || null],
          ["Primary Strategy", formatStrategyLabel(post.primaryStrategy)],
          ["Strategy Effectiveness", rating(post.primaryStrategyEffectiveness)],
          ["Reported Primary Learning Activity", formatLearningActivityLabel(post.primaryLearningActivity)],
          ["Learning Reflection", post.learningReflection],
          ["Next-session Adjustment", post.nextSessionAdjustment],
        ]}
      />
    </div>
  );
}
