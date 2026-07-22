export const UNAVAILABLE_VALUE = "\u2014";

const metricPresentationById = {
  attention: {
    card: "border-cyan-400/15 bg-cyan-400/[0.06]",
    title: "text-cyan-300",
    average: "text-cyan-200/70",
    icon: "border-cyan-300/20 bg-cyan-300/10 text-cyan-200",
    tableValue: "text-cyan-200",
  },
  fatigue: {
    card: "border-rose-400/15 bg-rose-400/[0.06]",
    title: "text-rose-300",
    average: "text-rose-200/70",
    icon: "border-rose-300/20 bg-rose-300/10 text-rose-200",
    tableValue: "text-rose-200",
  },
  valence: {
    card: "border-emerald-400/15 bg-emerald-400/[0.06]",
    title: "text-emerald-300",
    average: "text-emerald-200/70",
    icon: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
    tableValue: "text-emerald-200",
  },
  arousal: {
    card: "border-amber-400/15 bg-amber-400/[0.06]",
    title: "text-amber-300",
    average: "text-amber-200/70",
    icon: "border-amber-300/20 bg-amber-300/10 text-amber-200",
    tableValue: "text-amber-200",
  },
};

const fallbackMetricPresentation = {
  card: "border-white/10 bg-white/[0.04]",
  title: "text-slate-200",
  average: "text-slate-200/70",
  icon: "border-white/10 bg-white/[0.06] text-slate-300",
  tableValue: "text-slate-200",
};

export const getMetricPresentation = (metricId) => metricPresentationById[metricId] || fallbackMetricPresentation;
