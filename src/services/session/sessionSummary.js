import {
  DEFAULT_MINIMUM_DATA_COVERAGE,
  SESSION_SUMMARY_ALGORITHM_VERSION,
  SUMMARY_CONFIDENCE,
} from "./sessionConstants.js";

export const DEFAULT_SESSION_SUMMARY_THRESHOLDS = Object.freeze({
  minimumCoverage: DEFAULT_MINIMUM_DATA_COVERAGE,
  strongCoverage: 0.8,
  highAttention: 70,
  lowAttention: 45,
  highFatigue: 65,
  meaningfulTrendChange: 15,
  neutralValenceBand: 0.2,
  highArousal: 0.5,
  lowArousal: -0.3,
});

// Preliminary product rules only. These thresholds are not scientifically validated and should be revised after professional literature review.
const mergeThresholds = (thresholds = {}) => ({ ...DEFAULT_SESSION_SUMMARY_THRESHOLDS, ...thresholds });
const section = (label, title, message, confidence) => ({ label, title, message, confidence });
const metricMean = (statistics, key) => statistics?.[key]?.mean ?? null;
const metricTrend = (statistics, key) => statistics?.[key]?.trend ?? "insufficient";

/** Generate a replaceable, rule-based completed-session summary from session-level data. @param {{statistics:Object,session?:Object,thresholds?:Object,algorithmVersion?:string,now?:Function}=} input @returns {import("./sessionSchema.js").SessionSummary} */
export const generateSessionSummary = ({
  statistics,
  thresholds,
  algorithmVersion = SESSION_SUMMARY_ALGORITHM_VERSION,
  now = () => new Date().toISOString(),
} = {}) => {
  const thresholdProfile = mergeThresholds(thresholds);
  const coverage = statistics?.dataCoverage ?? 0;
  const hasMinimumCoverage = coverage >= thresholdProfile.minimumCoverage;
  const hasStrongCoverage = coverage >= thresholdProfile.strongCoverage;
  const confidence = hasStrongCoverage
    ? SUMMARY_CONFIDENCE.HIGH
    : hasMinimumCoverage
      ? SUMMARY_CONFIDENCE.MODERATE
      : SUMMARY_CONFIDENCE.INSUFFICIENT;

  if (!hasMinimumCoverage) {
    const limited = section("limited-data", "Limited data", "There was not enough valid data to generate a reliable summary for this session.", SUMMARY_CONFIDENCE.INSUFFICIENT);
    return {
      overallStatus: limited,
      behavioralEngagement: section("behavior-limited", "Behavioral signal limited", "Attention and fatigue estimates should be treated cautiously because data coverage was low.", SUMMARY_CONFIDENCE.INSUFFICIENT),
      fatiguePattern: section("fatigue-limited", "Fatigue signal limited", "The session does not contain enough calibrated interval data to describe a fatigue pattern.", SUMMARY_CONFIDENCE.INSUFFICIENT),
      emotionalEngagement: section("affect-limited", "Affect signal limited", "Estimated valence and arousal were unavailable or too sparse for a dependable session-level note.", SUMMARY_CONFIDENCE.INSUFFICIENT),
      dataReliability: limited,
      generatedAt: now(),
      algorithmVersion,
      thresholdProfile,
    };
  }

  const attentionMean = metricMean(statistics, "attention");
  const fatigueMean = metricMean(statistics, "fatigue");
  const valenceMean = metricMean(statistics, "valence");
  const arousalMean = metricMean(statistics, "arousal");
  const fatigueTrend = metricTrend(statistics, "fatigue");

  const behavioralEngagement = attentionMean === null
    ? section("attention-missing", "Attention unavailable", "Attention estimates were not available for enough intervals.", SUMMARY_CONFIDENCE.LOW)
    : attentionMean >= thresholdProfile.highAttention
      ? section("attention-steady", "Steady attention", "Attention remained generally steady during this session.", confidence)
      : attentionMean < thresholdProfile.lowAttention
        ? section("attention-variable", "Attention varied", "Attention appeared to drift during parts of this session.", confidence)
        : section("attention-moderate", "Moderate attention", "Attention stayed in a moderate range across the session.", confidence);

  const fatiguePattern = fatigueMean === null
    ? section("fatigue-missing", "Fatigue unavailable", "Fatigue estimates were not available for enough intervals.", SUMMARY_CONFIDENCE.LOW)
    : fatigueMean >= thresholdProfile.highFatigue
      ? section("fatigue-high", "Fatigue elevated", "Fatigue appeared elevated across this session, so a slower pace may help next time.", confidence)
      : fatigueTrend === "increasing"
        ? section("fatigue-rising", "Fatigue increased", "Fatigue increased during the final part of the session.", confidence)
        : section("fatigue-contained", "Fatigue contained", "Fatigue stayed within a manageable range for most of the session.", confidence);

  let emotionalEngagement = section("affect-missing", "Affect unavailable", "Estimated affect was not available for enough intervals to describe a session-level pattern.", SUMMARY_CONFIDENCE.LOW);
  if (valenceMean !== null && arousalMean !== null) {
    const valenceDescription = Math.abs(valenceMean) <= thresholdProfile.neutralValenceBand
      ? "near neutral"
      : valenceMean > 0
        ? "more positive"
        : "more subdued";
    const arousalDescription = arousalMean >= thresholdProfile.highArousal
      ? "higher activation"
      : arousalMean <= thresholdProfile.lowArousal
        ? "lower activation"
        : "moderate activation";
    emotionalEngagement = section("affect-pattern", "Affect pattern", `Estimated affect stayed ${valenceDescription} with ${arousalDescription} during the session.`, confidence);
  }

  return {
    overallStatus: section("session-summary", "Session summarized", "This summary reflects interval-level study signals collected across the session.", confidence),
    behavioralEngagement,
    fatiguePattern,
    emotionalEngagement,
    dataReliability: section(
      hasStrongCoverage ? "data-strong" : "data-partial",
      hasStrongCoverage ? "Good data coverage" : "Partial data coverage",
      hasStrongCoverage ? "Most planned intervals contained valid study-signal data." : "Enough data was available for a cautious summary, but some intervals were incomplete.",
      confidence
    ),
    generatedAt: now(),
    algorithmVersion,
    thresholdProfile,
  };
};
