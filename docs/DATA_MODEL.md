# Data Model

This document summarizes the local session-domain records used by the browser app. The current IndexedDB database structure remains `study_sessions` plus `metric_samples`; the optional fields below are normalized at the session-service boundary and do not require an IndexedDB structural migration.

## Study Sessions

Study-session records store setup context, lifecycle state, recovery timing, optional self-report, and the regular-break planning contract. Existing sessions without the newer optional fields remain valid.

Duration fields use milliseconds. Do not mix seconds into session-domain records.

```js
sessionPlan: {
  targetDurationMs: number | null,
  focusDurationMs: number | null,
  breakDurationMs: number,
  plannedBreakCount: number
}
```

The safe no-break default is `focusDurationMs: null`, `breakDurationMs: 0`, and `plannedBreakCount: 0`. `plannedBreakCount` may be derived from target/focus/break durations when it is not explicitly present.

Regular breaks are optional and disabled by default. When enabled, `focusDurationMs` must be a five-minute multiple from 25 to 90 minutes, `breakDurationMs` must be a five-minute multiple from 5 to 15 minutes, and break duration must not exceed one third of focus duration. Target duration is focused-study time; planned breaks are created after complete focus intervals before the exact end of the target duration.

```js
breakEvents: [
  {
    id: string,
    plannedStartElapsedMs: number | null,
    plannedStartAt: string | null,
    actualStartElapsedMs: number | null,
    actualStartAt: string | null,
    actualEndElapsedMs: number | null,
    actualEndAt: string | null,
    warningShownAt: string | null,
    readyAt: string | null,
    baseDurationMs: number | null,
    activeSegmentStartedAt: string | null,
    activeSegmentDurationMs: number | null,
    decisionStartedAt: string | null,
    decisionAlarmReplayedAt: string | null,
    extensionCount: number,
    totalExtensionDurationMs: number,
    actualActiveBreakDurationMs: number,
    skipped: boolean,
    status: "scheduled" | "active" | "completed" | "skipped" | "cancelled"
  }
]
```

Planned breaks are distinct from manual pauses and monitoring interruptions. A planned break must not be stored as an interruption. `skipped` means the break never began; `completed` means the break began and ended normally or early; `active` covers base break time or a three-minute extension; `cancelled` is used when the session ends before normal break completion.

```js
interruptions: [
  {
    id: string,
    startElapsedMs: number | null,
    startAt: string | null,
    endElapsedMs: number | null,
    endAt: string | null,
    reason: "manual-pause" | "page-hidden" | "camera-lost"
  }
]
```

The app does not yet implement hidden-tab continuous monitoring or automatically record `page-hidden` interruptions.

## Metric Samples

Formal `MetricSample` records remain the only Dashboard chart time series. They are approximately five-second aggregate intervals and contain derived metrics, coverage counts, data-quality metadata, and version fields. Pause, break-ready, and finish transitions force-flush useful partial observations; empty intervals are not fabricated. Break-ready waits, active breaks, extension time, and completed-break decision waits do not create formal samples.

## Persistence Boundary

IndexedDB stores study-session records and formal metric samples only. Flexible session records allow the regular-break fields above without an IndexedDB structural migration. It does not store camera frames, face crops, raw landmarks, raw MediaPipe results, model tensors, logits, full emotion probability vectors, short-term estimator buffers, debug telemetry, audio objects, or JavaScript timer handles.

Clearing browser site data removes local history and recoverable sessions. Hidden-tab continuous break alarms are not guaranteed; the app recomputes a coherent state from timestamps when it runs again. Cloud sync and Supabase remain future work.
