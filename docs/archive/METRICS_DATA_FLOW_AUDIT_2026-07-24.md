# Metrics Data Flow Audit

Historical note: this audit captured the pre-migration metric data flow on July 24, 2026. It is archived because later milestones renamed the behavioral metric to `attention`, removed legacy `stress` and legacy 0-100 `arousal`, isolated Debug overrides, and made formal five-second `MetricSample` records the single Dashboard chart time series.

## Executive Summary

Confirmed algorithm and semantic conflicts exist between the legacy live state names and the newer session model. The strongest conflict is that `AppContext` still exposes a live `focus` state, while formal session observations save that same value under the canonical `attention` field. This is not a separate algorithm: the session `attention` value is copied from `latestFocusRef.current` in `recordSessionObservation()` after `updateAiMetrics()` updates `focus` from the rolling attention estimator.

The second confirmed conflict is `arousal`. There are two distinct fields named arousal: legacy `arousal` in `AppContext` is a 0-100 manual/debug state, while session `arousal` is the smoothed EmotiEffLib/ONNX valence-arousal output normalized by schema to -1..1. The Dashboard consumes the session arousal, not the legacy 0-100 arousal, but DebugPanel labels the legacy value as "Arousal / Engagement" with a percent sign.

`stress` has no confirmed real-time calculation in current source. It is initialized, reset, exposed through context, and manually adjustable in DebugPanel, but it does not enter session observations, samples, Dashboard charts, reports, CSV export, or Focus Space. It is not safe to delete all legacy code at once because DebugPanel and context consumers still reference the fields. The safest next migration step is to rename or quarantine legacy manual fields as debug-only, preserve observed CV signals, and stop treating legacy `focus`, `stress`, or 0-100 `arousal` as formal metrics except where intentionally bridged to `attention`.

## Metrics Inventory

| Metric | Range | Category | Producer | Storage | Consumers | Recommended Status |
| ------ | ----: | -------- | -------- | ------- | --------- | ------------------ |
| `focus` | 0-100 | heuristic, legacy | `updateAiMetrics()` attention estimator; DebugPanel overrides | React state `focus`, `latestFocusRef`, context | ActiveSessionCard, FocusMonitorWindow, DebugPanel; copied into session `attention` | Rename |
| `attention` | 0-100 | heuristic | Alias/copy of live `focus` in `recordSessionObservation()` | `MetricObservation`, live rows, `MetricSample`, session statistics | Dashboard cards/charts/table, summaries, session history modal | Keep |
| `attentionEstimate` | 0-100 | heuristic | `attentionEstimateRef` smoothed from `attentionRaw` | React ref only; debug console table | Debug console output when Debug Mode is on | Keep |
| `stress` | 0-100 | override, legacy | Initial state, reset, DebugPanel slider only | React state `stress`, context | DebugPanel only | Deprecate |
| `fatigue` | 0-100 | heuristic, override | `updateAiMetrics()` fatigue estimator; DebugPanel yawn/slider overrides | React state/ref, `MetricObservation`, live rows, `MetricSample`, statistics | ActiveSessionCard, FocusMonitorWindow, DebugPanel, Dashboard, summaries | Review formula |
| legacy `arousal` | 0-100 | override, legacy | Initial state, reset, DebugPanel slider only | React state `arousal`, context | DebugPanel only | Deprecate |
| affect `arousal` | -1 to 1 | model | EmotiEffLib/ONNX output index 9, smoothed in `updateAffectMetrics()` | `affectState`, `MetricObservation`, live rows, `MetricSample`, statistics | Dashboard cards, emotional chart, summaries, table, history modal | Keep |
| `activation` | -1 to 1 semantics in copy only | model label/alias | Session summary text from affect arousal | Summary text | SessionSummaryPanel via completed session summary | Rename |
| `valence` | -1 to 1 | model | EmotiEffLib/ONNX output index 8, smoothed | `affectState`, `MetricObservation`, live rows, `MetricSample`, statistics | Dashboard cards, emotional chart, summaries, table, history modal | Keep |
| `emotion` | categorical | model | Highest raw emotion logit from EmotiEffLib output indices 0-7 | `affectState`, observations, samples, statistics | Metric table, emotional chart tooltip, dominant emotion statistics | Keep |
| `emotionConfidence` | 0-1 | model, unconfirmed/missing field | Reads `result.confidence`, but affect model does not return `confidence` | Always null from current model path | Metric table tooltip, emotion aggregation | Review formula |
| `emotionLogits` | raw logits | model | EmotiEffLib output slice 0-7 | Returned by `predictAffectFromCanvas()`, logged in debug console result only | Development console only | Keep |
| `emotionProbabilities` | Unconfirmed | Unconfirmed | No current source match | None confirmed | None confirmed | Unconfirmed |
| `dataQuality` | `good`/`partial`/`insufficient`; live debug also uses `limited` | heuristic | Live observation coverage and aggregation coverage | live rows, `MetricSample`, cards/tables/charts | Dashboard cards, charts, tables | Review formula |
| debug sliders/manual values | 0-100 or 1-15 FPS | override | DebugPanel range inputs | Shared context state | DebugPanel; focus/fatigue overrides can affect session samples | Rename |
| simulated events | event counts/string labels | simulated, override | DebugPanel event buttons | Shared context state | DebugPanel, ActiveSessionCard/FocusMonitorWindow for yawn's focus/fatigue effect | Rename |

## Dependency Traces

### Focus And Attention

Observed inputs are face presence, face landmarks, eye calibration readiness, and head pose. `updateAiMetrics()` receives MediaPipe face and gesture results from `MonitoringRuntimeHost` after `detectForVideo()` and `recognizeForVideo()` run at the configured `inferenceFps` throttle. The host calls `updateAiMetrics(faceResults, gestureResults, latencyTime, video dimensions)` after each sampled frame.

`focus` is produced by the attention estimator, not by a variable named attention in React state. In `AppContext`, the rolling estimator holds `attentionEstimateRef` and `latestFocusRef`, while user-facing state is `focus`. The formula is:

```text
facePresenceScore = faceDetected samples / attentionWindow samples * 100
forwardPoseScore = mean(min(1 - abs(yaw)/45, 1 - abs(pitch)/35) * 100)
headStabilityScore = 100 if movementLevel <= 4, else clamp(100 - (movementLevel - 4) * 6, 0, 100)
attentionRaw = facePresenceScore * 0.30 + forwardPoseScore * 0.50 + headStabilityScore * 0.20
attentionEstimate = previousAttentionEstimate * 0.8 + attentionRaw * 0.2
focus = round(clamp(attentionEstimate, 0, 100))
```

Evidence: estimator refs and state are declared in `src/context/AppContext.js:147`, `src/context/AppContext.js:160`, and `src/context/AppContext.js:316`. Reset clears observations and seeds `attentionEstimateRef` in `src/context/AppContext.js:327`. The formula and `setFocus()` call are in `src/context/AppContext.js:783`, `src/context/AppContext.js:790`, `src/context/AppContext.js:803`, and `src/context/AppContext.js:815`.

The formal session `attention` field is copied from `latestFocusRef.current` in `src/context/AppContext.js:494`; one-second live dashboard rows copy the same `observation.attention` in `src/context/AppContext.js:514`. Aggregation averages valid observations into `MetricSample.attention` in `src/services/session/metricAggregation.js:84`, and schema clamps it to 0-100 in `src/services/session/sessionSchema.js:156` and `src/services/session/sessionSchema.js:175`.

Consumers: Dashboard cards use `attention` definitions in `src/services/session/sessionSelectors.js:83` and active current metrics in `src/components/DashboardCharts.js:45`. Behavioral chart uses attention in `src/components/dashboard/BehavioralEngagementChart.js:46`. Metric stream table displays Attention in `src/components/dashboard/MetricStreamTable.js:103`. Active study status and Focus Space still read `focus` directly in `src/components/product/ActiveSessionCard.js:18` and `src/components/focus/FocusMonitorWindow.js:11`.

No face behavior: no-face samples remain in the observation window with `faceDetected=false`, reducing `facePresenceScore`, but the estimator only updates when `dataQualityRatio >= 0.5` and eye calibration is ready. The hidden runtime still calls `updateAiMetrics()` even when no face is detected, but affect analysis only runs for exactly one face. Evidence: `faceDetected` at `src/context/AppContext.js:563`, no-face blink reset at `src/context/AppContext.js:723`, data quality gate at `src/context/AppContext.js:807`, and affect face count gate at `src/components/monitoring/MonitoringRuntimeHost.js:320`.

Webcam disabled or monitoring paused: the runtime exits and clears outputs if `!isMonitoring || !isCameraAllowed || !isAiLoaded`; `recordSessionObservation()` also returns unless the active session is active, monitoring is true, and the clock is running. Evidence: `src/components/monitoring/MonitoringRuntimeHost.js:262` and `src/context/AppContext.js:469`.

### Stress

No current real-time calculation for `stress` was confirmed. `stress` is initialized at `src/context/AppContext.js:161`, reset to 25 in `src/context/AppContext.js:1203`, exposed through context in `src/context/AppContext.js:1260`, and manually set by DebugPanel in `src/components/DebugPanel.js:178`. There is no `stress` field in `MetricObservation` or `MetricSample` typedefs (`src/services/session/sessionSchema.js:13`) and no session aggregation, statistics, Dashboard chart, report, export, or Focus Space consumer.

Input signals: none confirmed. Formula: none confirmed. Update frequency: only user manual slider/reset. Recommended status: `Deprecate` as debug-only until a validated formula exists.

### Fatigue

Fatigue has multiple producers. The main producer is the rolling fatigue estimator in `updateAiMetrics()`; DebugPanel can also override fatigue directly and `injectYawn()` increases it by 15 while reducing focus by 10.

Observed inputs are normalized eye openness, closed-eye ratio over a 30-second window, long closures in the last minute, and deviation from a baseline blink rate. Baseline open EAR is collected for the first 8 seconds with at least 12 valid samples, then set to the median. Baseline blink rate is set after 30 seconds if data quality is at least 0.5.

Formula:

```text
normalizedEyeOpenness = clamp(averageEAR / baselineOpenEAR, 0, 1.2)
eyesClosed = normalizedEyeOpenness < 0.35
closedEyeRatio = closed eye samples / valid eye samples in last 30000 ms
perclosScore = clamp(((closedEyeRatio - 0.05) / 0.25) * 100, 0, 100)
longClosureScore = clamp(longClosuresLastMinute * 25, 0, 100)
blinkRateScore = 0 if blink rate deviation <= 0.3, else clamp(((deviation - 0.3) / 0.7) * 100, 0, 100)
fatigueRaw = perclosScore * 0.55 + longClosureScore * 0.30 + blinkRateScore * 0.15
fatigueEstimate = previousFatigueEstimate * 0.85 + fatigueRaw * 0.15
fatigue = round(clamp(fatigueEstimate, 0, 100))
```

Evidence: baseline constants in `src/context/AppContext.js:12`, `src/context/AppContext.js:17`, and `src/context/AppContext.js:23`; EAR calculation in `src/context/AppContext.js:39`; baseline collection in `src/context/AppContext.js:580`; normalized eye openness in `src/context/AppContext.js:601`; blink/closure tracking in `src/context/AppContext.js:695`; fatigue formula in `src/context/AppContext.js:826` and `src/context/AppContext.js:861`.

Formal session storage copies `latestFatigueRef.current` into observations at `src/context/AppContext.js:495`, live rows at `src/context/AppContext.js:515`, samples at `src/services/session/metricAggregation.js:85`, and statistics at `src/services/session/sessionStatistics.js:109`. Dashboard and reports use fatigue in cards, behavioral charts, tables, history modal, and summary text.

Consistency concern: the estimator is baseline-dependent, but manual DebugPanel writes can bypass estimator refs. `resetEstimatorSession()` seeds `fatigueEstimateRef` from current fatigue when monitoring starts (`src/context/AppContext.js:346`) or baseline values when a prepared session activates (`src/context/AppContext.js:1019`). DebugPanel writes `setFatigue()` at `src/components/DebugPanel.js:197` and `injectYawn()` at `src/components/DebugPanel.js:45`, so manual values can enter formal session samples before the estimator overwrites or reseeds.

### Arousal And Activation

There are two distinct arousal values:

1. Legacy `arousal` state: 0-100, initialized in `src/context/AppContext.js:163`, reset in `src/context/AppContext.js:1205`, exposed in context at `src/context/AppContext.js:1264`, and manually set in DebugPanel at `src/components/DebugPanel.js:216`. It is not written to session samples.
2. Affect `arousal`: model output index 9 from `/models/emotieff/enet_b0_8_va_mtl.onnx`, smoothed with alpha 0.2 in `updateAffectMetrics()`, stored in `affectState`, then copied to session observations and samples. Evidence: model output indices in `src/services/affect/browserAffectModel.js:17`, output read in `src/services/affect/browserAffectModel.js:84`, smoothing in `src/context/AppContext.js:432`, session copy in `src/context/AppContext.js:497`, schema clamp to -1..1 in `src/services/session/sessionSchema.js:159` and `src/services/session/sessionSchema.js:178`.

Activation is not a stored field. It appears as explanatory summary language for affect arousal in `src/services/session/sessionSummary.js:85`. Recommended status: keep affect arousal; rename legacy arousal to a debug-only name before deletion.

### Valence

Valence is a model metric from EmotiEffLib/ONNX output index 8. `predictAffectFromCanvas()` reads the raw output, validates output length 10, and returns `valence` with `valid` set only when both valence and arousal are finite. `updateAffectMetrics()` smooths valence with alpha 0.2 and stores it in `affectState`; session observations copy it only when `currentAffect.valid` is true.

Evidence: `src/services/affect/browserAffectModel.js:73`, `src/services/affect/browserAffectModel.js:81`, `src/services/affect/browserAffectModel.js:84`, `src/context/AppContext.js:426`, and `src/context/AppContext.js:496`. Storage and consumers mirror affect arousal: schema clamps to -1..1, aggregation averages affect-valid observations, emotional chart plots it, and summaries describe it.

### Discrete Facial Expression

The discrete emotion category is selected by taking the max raw logit among the first eight EmotiEffLib outputs. The label order in the affect model is `Anger`, `Contempt`, `Disgust`, `Fear`, `Happiness`, `Neutral`, `Sadness`, `Surprise` (`src/services/affect/browserAffectModel.js:6`). Session constants use the same set but a different order for deterministic aggregation tie-breaking (`src/services/session/sessionConstants.js:37`). The selected emotion is stored in `affectState.emotion`, then in observations, live rows, samples, metric stream rows, and dominant-emotion statistics.

Evidence: logit selection in `src/services/affect/browserAffectModel.js:81`, state write in `src/context/AppContext.js:444`, observation copy in `src/context/AppContext.js:498`, aggregation in `src/services/session/metricAggregation.js:33`, and sample-level dominant emotion in `src/services/session/sessionStatistics.js:75`.

### Emotion Confidence

`emotionConfidence` is currently invalid/missing in the real model path. `updateAffectMetrics()` reads `result.confidence` (`src/context/AppContext.js:445`), but `predictAffectFromCanvas()` returns `emotionLogits`, `rawOutput`, `valence`, `arousal`, `emotion`, source, and valid status, with no `confidence` or `emotionProbabilities` field (`src/services/affect/browserAffectModel.js:87`). Therefore `affectState.confidence` remains null for valid model results, and session `emotionConfidence` remains null unless a caller manually supplies a `confidence` field.

Downstream consumers expect `emotionConfidence`: observations copy it at `src/context/AppContext.js:499`, aggregation averages it at `src/services/session/metricAggregation.js:40`, MetricStreamTable exposes it as tooltip title at `src/components/dashboard/MetricStreamTable.js:120`, and EmotionalEngagementChart displays it in tooltips at `src/components/dashboard/EmotionalEngagementChart.js:151`.

### Data Quality

There are two related classifications:

- Live estimator debug quality: `good`, `limited`, or `insufficient`, based on 10-second face presence ratio in `src/context/AppContext.js:753`.
- Formal session quality: `good`, `partial`, or `insufficient`, based on valid observations divided by expected observations in `src/services/session/metricAggregation.js:17` and thresholds in `src/services/session/sessionConstants.js:48`.

The live rows added in `recordSessionObservation()` use the formal labels `good`, `partial`, `insufficient` at `src/context/AppContext.js:520`. Dashboard cards and tables display these labels from live rows or samples in `src/services/session/sessionSelectors.js:140`, `src/components/dashboard/DashboardMetricCards.js:80`, and `src/components/dashboard/MetricStreamTable.js:124`.

### Debug Overrides And Simulations

DebugPanel is not read-only. It reads shared runtime data and also writes a separate manual/override path into shared context. It can set `focus`, `stress`, `fatigue`, `arousal`, `blinkRate`, `yawnCount`, `currentGesture`, and `inferenceFps`.

Evidence: state destructuring in `src/components/DebugPanel.js:7`; focus/stress/fatigue/arousal sliders in `src/components/DebugPanel.js:159`, `src/components/DebugPanel.js:178`, `src/components/DebugPanel.js:197`, and `src/components/DebugPanel.js:216`; yawn and blink injectors in `src/components/DebugPanel.js:45` and `src/components/DebugPanel.js:52`; gesture injector in `src/components/DebugPanel.js:57`.

When DebugPanel overrides focus or fatigue during an active session, `latestFocusRef` and `latestFatigueRef` update through `useEffect()` and can enter formal session observations at `src/context/AppContext.js:316`, `src/context/AppContext.js:323`, and `src/context/AppContext.js:494`. Real inference still continues unless monitoring/camera/model gates are off; there is no explicit override flag that prevents real values from being calculated or saved.

The current source did not confirm an automatic random simulation fallback for metric values. Historical documentation mentions it, but current `src` contains only DebugPanel event/manual simulation controls and the pre-AI visual fallback in `CameraFeed`. Mark automatic metric simulation as unconfirmed in current source.

## Confirmed Conflicts

### Naming Conflicts

- `focus` and `attention` name the same live heuristic value at different boundaries: live UI reads `focus`, session storage reads `attention`.
- `arousal` names two unrelated values: legacy 0-100 debug state and affect model -1..1 session value.
- `activation` is summary copy for affect arousal, not a stored metric.

### Range Conflicts

- Legacy DebugPanel `Arousal / Engagement` is 0-100 percent (`src/components/DebugPanel.js:216`), while Dashboard/session `Arousal` is -1..1 affect (`src/services/session/sessionSelectors.js:87`).
- Live estimator debug `dataQuality` uses `limited`; formal samples use `partial`.

### Duplicated Algorithms

- No duplicated focus/attention algorithm was confirmed. Instead, `attention` is copied from the `focus` value.
- Fatigue has duplicated producer paths because the heuristic estimator and DebugPanel/manual yawn injection can both write the same shared `fatigue` state.

### State Overwrites

- DebugPanel focus/fatigue overrides can be overwritten by the next reliable estimator update, and can also enter session samples before that overwrite.
- DebugPanel legacy arousal and stress are not overwritten by real inference because no real producer writes those states.

### Persistence Conflicts

- `stress` and legacy 0-100 `arousal` do not persist in session samples, but DebugPanel presents them as live state metrics.
- Formal `attention` persists a value that is still named `focus` in live context.

### Misleading UI Labels

- DebugPanel tab label `Overrides` and heading `Manual State Overrides` are accurate, but the UI does not warn that focus/fatigue overrides can enter formal session samples.
- DebugPanel `Arousal / Engagement` uses a percent display that conflicts with Dashboard `Arousal` affect range.
- `Study Status` copy in ActiveSessionCard and FocusMonitorWindow uses live `focus`, while Dashboard labels the same concept `attention`.

### Invalid Or Missing Model Fields

- `emotionConfidence` reads `result.confidence`, but the affect model returns no `confidence` field.
- No `emotionProbabilities` field was found in current source.

## Required Questions

1. Do legacy `focus` and current `attention` use the same algorithm?
   Yes. Session `attention` is copied from live `focus`, which is produced by the attention estimator in `updateAiMetrics()`.

2. Are they running simultaneously, copied from one another, or capable of overwriting each other?
   They are copied at the session boundary: `attention: latestFocusRef.current`. There is no independent `attention` React state overwriting `focus`.

3. What inputs and formula currently produce `stress`?
   No implementation-supported inputs or formula were found. Current producers are initialization, reset, and DebugPanel manual slider.

4. Does `stress` enter formal session samples, Dashboard charts, reports, exports, or Focus Space controls?
   No confirmed path. It is absent from session schema, aggregation, Dashboard selectors, charts, Focus Space, and raw landmark CSV.

5. How many distinct values are called `arousal` or `activation`?
   Two stored arousal values: legacy 0-100 `AppContext.arousal`, and affect -1..1 session `arousal`. `activation` is summary wording only.

6. Is the legacy Debug value in the `0-100` range mixed with EmotiEffLib affect arousal in the `[-1, 1]` range?
   They coexist under the same name but are not mixed in storage. The UI label conflict is confirmed; session samples use affect arousal only.

7. Does `fatigue` have one producer or multiple producers?
   Multiple producers: heuristic estimator, DebugPanel fatigue slider, and DebugPanel yawn injection.

8. Is the fatigue formula, range, smoothing, and baseline lifecycle consistent throughout the application?
   Mostly consistent in the estimator/session path, but not across manual override paths. The estimator uses 0-100, alpha 0.15 smoothing, open-EAR and blink-rate baselines; manual writes bypass that lifecycle.

9. Does `DebugPanel` only read shared runtime data, or does it maintain or calculate a separate metric system?
   It reads shared data and writes shared overrides. It does not maintain separate local metric state for the four legacy sliders.

10. When an override or simulator is active, are real inference values still calculated or saved?
    Yes, if monitoring/camera/model gates remain active. There is no override flag that stops inference or excludes overridden focus/fatigue from samples.

11. Can the UI clearly distinguish real, heuristic, model, simulated, and overridden values?
    No. Dashboard separates behavioral and affect ranges, but DebugPanel and status copy do not clearly mark focus/fatigue as potentially overridden or heuristic.

12. Does `emotionConfidence` read a field that the affect model never returns?
    Yes. `updateAffectMetrics()` reads `result.confidence`, but `predictAffectFromCanvas()` does not return `confidence`.

13. What would break if the legacy focus, stress, or arousal code were deleted now?
    Deleting `focus` would break ActiveSessionCard, FocusMonitorWindow, DebugPanel, and the session `attention` bridge. Deleting `stress` would break DebugPanel/context destructuring. Deleting legacy 0-100 `arousal` would break DebugPanel/context destructuring but not formal session samples.

14. Which observed signals must be preserved even if their current derived metrics are deprecated?
    Preserve face detection/presence, face landmarks, eye EAR/openness, blink events/rate, long closures, head pose yaw/pitch/roll, hand landmarks/gestures, camera/monitoring state, MediaPipe model state, affect model state, FPS/inference latency, data quality inputs, and session pause/resume clock state.

## Deletion Risk Matrix

| Candidate code or field | Current dependencies | Risk if deleted now | Recommendation |
| ----------------------- | -------------------- | ------------------- | -------------- |
| `focus` state/context | DebugPanel, ActiveSessionCard, FocusMonitorWindow, session `attention` bridge | High: breaks UI and formal session attention | Rename/bridge first |
| `attentionEstimateRef` | `updateAiMetrics()` formula, debug console | High: estimator loses smoothing | Keep |
| `stress` state/context | DebugPanel slider only | Low runtime risk, medium UI/context risk | Deprecate then remove after DebugPanel update |
| legacy `arousal` state/context | DebugPanel slider only | Low runtime risk, medium UI/context risk | Deprecate then remove after rename |
| affect `affectState.arousal` | session observations, Dashboard emotional chart, summaries | High | Keep |
| `fatigue` state/context | estimator, DebugPanel, Focus Space, active card, session samples | High | Keep; separate override path |
| DebugPanel focus/fatigue sliders | shared state and possible session samples | Medium: removal changes debug workflow | Replace with explicit override controls |
| `emotionConfidence` field | schema, aggregation, table/chart tooltips | Low if null-safe, but misleading | Populate from probabilities or rename unavailable |
| `metricsHistory` | context exposure and clearing only | Low | Remove later after confirming no external consumer |
| raw landmarks history | telemetry CSV export | Medium: breaks CSV and audit/debug visibility | Preserve |
| observed signal refs/windows | attention/fatigue estimators | High | Preserve |

## Minimal Next Patch

Observed signals that must remain: face presence, face landmarks, eye EAR/openness, blink events and one-minute blink rate, long eye closures, yaw/pitch/roll, hand landmarks, gesture candidates, camera and monitoring state, pause/resume clock state, MediaPipe status, affect model status, FPS, and inference latency.

Metrics that should temporarily become legacy: `focus`, `stress`, and legacy 0-100 `arousal`. `focus` should remain bridged to session `attention` until UI consumers are migrated.

Fields that should stop entering formal session data: manual focus and manual fatigue overrides should not enter formal samples without an explicit `source` or `overrideActive` marker. `stress` and legacy 0-100 `arousal` already do not enter formal data.

Fields to rename without immediate deletion: rename live `focus` presentation to `attention` at the context boundary, or expose both with `focus` marked legacy. Rename legacy `arousal` to `debugArousalPercent` or remove it from shared runtime context after DebugPanel updates. Rename DebugPanel "Arousal / Engagement" to make the 0-100 debug nature explicit.

Likely files for the next patch: `src/context/AppContext.js`, `src/components/DebugPanel.js`, `src/components/product/ActiveSessionCard.js`, `src/components/focus/FocusMonitorWindow.js`, `src/services/session/sessionSchema.js`, `src/services/session/metricAggregation.js`, and dashboard table/chart tooltip components if `emotionConfidence` is fixed.

Tests required before removal: session domain tests for attention/fatigue aggregation with override markers, runtime tests proving paused sessions ignore observations, tests for affect samples with missing confidence, UI tests or component checks for Dashboard range labels, and a regression test that no `stress` or legacy 0-100 arousal enters `MetricSample`.
