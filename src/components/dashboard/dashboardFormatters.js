export const formatMetricValue = (value, valueKind = "percentage") => {
  if (!Number.isFinite(value)) return "Unavailable";
  if (valueKind === "affect") return value.toFixed(2);
  return `${Math.round(value)}`;
};

export const formatMetricUnit = (valueKind = "percentage") => (valueKind === "affect" ? "" : "%");

export const formatDateTime = (value) => {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00";
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const formatCoverage = (coverage) => {
  if (!Number.isFinite(coverage)) return "Unavailable";
  return `${Math.round(coverage * 100)}%`;
};

export const formatTask = (taskDescription) => taskDescription?.trim() || "Untitled study session";
export const formatTargetDuration = (targetDurationMs) => Number.isFinite(targetDurationMs) && targetDurationMs > 0
  ? formatDuration(targetDurationMs)
  : "No target";
