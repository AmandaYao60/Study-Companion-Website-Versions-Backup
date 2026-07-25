# Data Model

This document summarizes the local session-domain records used by the browser app. The current IndexedDB database structure remains `study_sessions` plus `metric_samples`; the optional fields below are normalized at the session-service boundary and do not require an IndexedDB structural migration.

## Study Sessions

Study-session records store setup context, lifecycle state, recovery timing, optional self-report, and the future break-planning contract. Existing sessions without the newer optional fields remain valid.

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
    status: "scheduled" | "active" | "completed" | "skipped" | "cancelled"
  }
]
```

Planned breaks are distinct from manual pauses and monitoring interruptions. A planned break must not be stored as an interruption.

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

Formal `MetricSample` records remain the only Dashboard chart time series. They are approximately five-second aggregate intervals and contain derived metrics, coverage counts, data-quality metadata, and version fields. Pause and finish transitions force-flush useful partial observations; empty intervals are not fabricated.

## Persistence Boundary

IndexedDB stores study-session records and formal metric samples only. It does not store camera frames, face crops, raw landmarks, raw MediaPipe results, model tensors, logits, full emotion probability vectors, short-term estimator buffers, debug telemetry, or Debug Simulation state.

Clearing browser site data removes local history and recoverable sessions. Cloud sync, Supabase, and the full timed-break experience remain future work.
