# Decisions

This file records decisions already reflected in the current source code.

## Canvas Does Not Draw While Monitoring Is Paused

Decision: `CameraFeed.js` clears and stops canvas drawing when `isMonitoring` is false.

Rationale: Paused monitoring should not imply active tracking.

Consequences or trade-offs: The paused state is visually quieter, but there is no decorative standby mesh.

## Canvas Does Not Draw While Camera Is Disabled

Decision: `CameraFeed.js` keeps the canvas empty when `isCameraAllowed` is false.

Rationale: If the webcam is disabled, there should be no tracking visualization.

Consequences or trade-offs: Users see the React camera-off overlay rather than simulated activity.

## No Simulated Landmarks After AI Has Loaded

Decision: When AI is loaded and no face is detected, the canvas does not draw fallback landmarks.

Rationale: Showing fallback landmarks after AI readiness would misrepresent detection state.

Consequences or trade-offs: The UI can appear sparse when no face is present, but it is more truthful.

## React Handles No Face Detected

Decision: `No Face Detected` is rendered as React UI state instead of a canvas drawing.

Rationale: Detection status is application state, not a fake tracking visualization.

Consequences or trade-offs: Overlay styling is easier to reason about, and canvas remains reserved for model output or pre-load fallback.

## Privacy Mode Was Removed

Decision: Privacy Mode and Privacy Shield UI/guards were removed for Phase 2.

Rationale: Focus Space now provides the landmarks-only presentation without pausing browser-local inference or adding a parallel camera path.

Consequences or trade-offs: The Monitor page always shows the real camera preview when enabled. Focus Space hides real pixels only inside the floating panel presentation while preserving the same `CameraFeed` inference implementation.

## AI-Loading Fallback Is Intentionally Simple

Decision: The pre-load fallback is a static face and loading/warning message.

Rationale: A simple placeholder communicates waiting without pretending that real tracking is active.

Consequences or trade-offs: It is less visually dynamic than the removed animation, but more honest.

## Focus Panel Reuses CameraFeed

Decision: The Focus Space floating monitor uses `CameraFeed` with a presentation prop instead of copying camera/inference code.

Rationale: Phase 1 inference is frozen and should remain owned by one component path.

Consequences or trade-offs: Presentation concerns live in `CameraFeed`, but MediaPipe and ONNX behavior stay centralized.

## Multiple Hands Are Preserved With Separate Hand IDs

Decision: `AppContext.js` stores every hand landmark with a `handId`.

Rationale: The Gesture Recognizer is configured for up to two hands, so telemetry needs to distinguish hands.

Consequences or trade-offs: CSV export is more useful, but downstream consumers must handle multiple hand sources.

## Two Visible Hands Are Only a Weak Possible Distraction Signal

Decision: Sustained two-hand activity logs a warning and slightly reduces attention after 10 frames.

Rationale: This is a tentative product heuristic for possible distraction or non-study movement.

Consequences or trade-offs: It can be wrong. Two visible hands might also mean typing, writing, gesturing, or normal study behavior.

## Documentation Follows Current Source Code

Decision: Documentation must be updated from the current files, not prior AI-generated assumptions.

Rationale: The camera and telemetry implementation has changed outside prior documentation.

Consequences or trade-offs: Historical documents are archived and marked as historical instead of being treated as active architecture.

## Completed Sessions Persist Locally In IndexedDB

Decision: The application uses a native IndexedDB implementation of the existing session repository contract as the browser app's default storage backend.

Rationale: Completed study-session summaries and formal interval metric samples should survive refreshes without introducing cloud synchronization, authentication, or a backend dependency.

Consequences or trade-offs: Persistence is local to the current browser and origin. Clearing site data, private/incognito browsing, or browser storage restrictions can remove or prevent durable history. Raw video, images, face crops, landmarks, telemetry rows, model logits, and full emotion probability arrays remain outside IndexedDB.

## Interrupted Active Sessions Recover As Paused

Decision: Active sessions write local timer checkpoints to IndexedDB about every five seconds and are recovered after refresh as paused, recovery-pending sessions.

Rationale: Study time should survive ordinary refreshes without counting time away from the page or requiring camera access during startup.

Consequences or trade-offs: Recovery is local to the same browser and origin, may lose up to roughly one checkpoint interval, and does not restore webcam streams, Monitoring, short-term baselines, pending observations, raw telemetry, landmarks, or model state. Returning from the recovery modal keeps the session paused. Resume preserves the same session ID but starts the study clock, Monitoring, and analysis only after the user grants camera access successfully.

## Debug Simulation Is Display-Only

Decision: Debug Mode exposes a developer diagnostics drawer with memory-only simulated display metrics selected through a display boundary:

```text
displayMetrics = simulationEnabled ? simulatedMetrics : liveMetrics
```

Rationale: UI development needs predictable attention, fatigue, valence, arousal, emotion, top-probability, face-state, and data-quality previews without corrupting live inference or persisted study history.

Consequences or trade-offs: Simulation can preview immediate diagnostic UI but does not create observations, formal metric samples, session statistics, completed history, repository writes, model output, camera state, Monitoring state, or checkpoint writes. Simulation and debug overrides reset when Debug Mode is turned off or the page refreshes.

## Debug Diagnostics Use A Memory-Only Snapshot

Decision: The Debug Panel reads a memory-only diagnostic snapshot updated at about one-second cadence from the existing live camera/model/session pipeline.

Rationale: Developers need to understand why attention, fatigue, affect, gesture, aggregation, and performance values are valid, stale, idle, or gated without adding a parallel estimator or writing diagnostic details into persistence.

Consequences or trade-offs: The snapshot can display intermediate values such as face coverage, pose and stability scores, EAR baseline progress, PERCLOS, blink-rate comparison, top three emotion probabilities, MediaPipe latency, and affect latency. It does not change formulas, enter formal samples, update session statistics, write IndexedDB records, persist full emotion probability arrays, or expose logits.

## Diagnostic Logs Are Sanitized And Memory-Only

Decision: The developer diagnostics event log is bounded to approximately 100 recent entries, coalesces immediate duplicates, supports clearing/copying sanitized text, and remains in React memory.

Rationale: Developers need a compact view of camera, model, session, sample, and checkpoint events without persisting sensitive runtime details.

Consequences or trade-offs: The log intentionally excludes images, media streams, landmarks, face coordinates, raw observations, logits, full probability arrays, tokens, and stack traces. It is lost on refresh and is not written to IndexedDB or any cloud service.

## Sensitive Debug Tools Require Explicit Action

Decision: Face-crop preview and raw landmark CSV export live inside a collapsed Advanced / Sensitive Data section in Debug Mode.

Rationale: Crops and landmark coordinates are sensitive biometric-derived developer artifacts even when they remain local and memory-only.

Consequences or trade-offs: The preview is off by default, raw landmarks are captured only while the sensitive preview/capture path is explicitly enabled, the buffer is bounded to approximately 50 recent frames, and the CSV export requires confirmation. These tools do not add crop images, landmarks, raw observations, logits, or full probability arrays to event logs, formal samples, session history, or IndexedDB.

## VA Charts Do Not Render Discrete Expression Regions

Decision: Emotional Engagement charts render a continuous valence-arousal trajectory without hardcoded discrete-emotion ellipses or regions.

Rationale: Valence-arousal coordinates are continuous affect outputs and should not imply that discrete facial expressions can be derived from chart position.

Consequences or trade-offs: Collapsed active/end-session cards and historical reports are static VA overviews. Active, paused, and latest completed main Dashboard sessions can open an expanded analysis dialog with point tooltips and an expression-interval distribution based only on stored top-1 classifier labels from valid affect intervals. Historical report modals have no expand action, tooltip, or distribution. No full probability vectors, logits, chart-only records, schema changes, or IndexedDB changes were added.

## Dashboard Uses Formal Samples As Its Chart Time Series

Decision: Active and paused current sessions are the main Dashboard source, the latest completed session is used only when there is no current session, and historical rows open `SessionHistoryModal` without replacing the main Dashboard source.

Rationale: The Dashboard previously had competing notions of selected data. Treating five-second `MetricSample` records as the single chart time series keeps active, paused, completed, and historical-modal views consistent.

Consequences or trade-offs: Active and paused charts use `activeSessionSamples`; completed charts use stored repository samples. Immediate active metric cards may still show current authoritative metric values, but trends and charts use committed samples. Pausing force-flushes useful pending observations into a final partial sample, while empty intervals are discarded. The old duplicate one-second live-history state is removed.

## Session Check-In And Reflection Extend The Session Record

Decision: Required setup, optional pre-session check-in, and optional post-session reflection are normalized into the existing study-session domain record instead of a parallel questionnaire store.

Rationale: The current repository already persists session summaries separately from formal metric samples. Keeping task context and concise self-report on the session record lets Dashboard history show the selected session consistently without adding a new state machine or storage backend.

Consequences or trade-offs: The session schema version is bumped, while the IndexedDB database structure remains unchanged. Older sessions normalize missing self-report fields to `null` and `[]` at the service boundary. The self-report is described as a theory-informed check-in/reflection, not a validated AEQ, MSLQ, ICAP, psychological, clinical, or diagnostic assessment.

## App State Uses Focused Provider Boundaries

Decision: The app exposes focused Session, Monitoring, and Debug hooks instead of a monolithic app-state consumer hook.

Rationale: Session lifecycle and persistence, camera/model monitoring, and developer diagnostics have different update frequencies, privacy boundaries, and consumers. Splitting the public context surface reduces broad rerender pressure and clarifies authoritative ownership without creating a second monitoring runtime.

Consequences or trade-offs: The top-level provider still coordinates cross-boundary actions such as camera-gated resume and clear-local-data. `MonitoringRuntimeHost` remains the only inference loop. Components must import the narrow hook that matches their responsibility.

## Timed Breaks Use The Session Provider Controller

Decision: `AppProvider` owns the regular-break scheduler, break phase, persisted break-event transitions, camera/inference shutdown, and shared session audio. `sessionPlan`, `breakEvents`, and `interruptions` remain normalized in the session-domain service layer.

Rationale: Break scheduling depends on effective focused-study time and must coordinate Session Setup, Focus Space, the floating monitor, camera recovery, formal sampling, and local audio without creating another provider refactor or second monitoring runtime.

Consequences or trade-offs: The IndexedDB structural version is unchanged because `study_sessions` stores flexible records. Existing sessions normalize to a safe no-break default. Hidden-tab continuous alarms are not guaranteed; persisted timestamps are used to restore the safest coherent break state when the app runs again. Planned breaks remain separate from manual pauses and interruptions, and no camera frames, landmarks, debug telemetry, audio objects, or timer handles are persisted.
