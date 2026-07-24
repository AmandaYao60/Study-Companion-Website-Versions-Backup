# Architecture

This document describes the current repository structure and runtime organization. It is based on the files in the current working tree.

## Application Structure

```text
src/
  app/
    layout.js
    page.js
    monitor/page.js
    focus/page.js
    dashboard/page.js
    globals.css
  components/
    Navbar.js
    CameraFeed.js
    DebugPanel.js
    DashboardCharts.js
    focus/
      FocusSpace.js
      FocusStagePlaceholder.js
      FocusMonitorWindow.js
      FocusSessionControls.js
  hooks/
    useDraggablePanel.js
    useSmoothSessionTimer.js
  context/
    AppContext.js
```

The app uses the Next.js App Router. `src/app/layout.js` defines the root HTML shell, loads Geist fonts, imports `globals.css`, wraps the app in `AppProvider`, and renders `Navbar` above route content.

## Primary Pages

- `src/app/page.js`: Overview page. Presents the Phase 1 POC, feature cards, privacy approach, and links to Study Space and Analytics.
- `src/app/monitor/page.js`: Redirects to the product Study Space at `/app/study`.
- `src/app/focus/page.js`: Focus Space shell. Renders a fullscreen-capable visual-stage placeholder and, while monitoring is active, a draggable floating monitor panel that reuses `CameraFeed` in `focus-panel` presentation.
- `src/app/dashboard/page.js`: Analytics view. Renders `DashboardCharts`, session diagnosis copy, and placeholder PDF export.

## Component Responsibilities

### Navbar

`src/components/Navbar.js` provides top-level navigation, a Debug Mode toggle, and monitoring status. It reads global state through `useAppState()`.

### CameraFeed

`src/components/CameraFeed.js` owns the camera UI and video/canvas rendering surface. It:

- Requests camera access through `startCamera()`.
- Allows explicit webcam disable through `handleDisableWebcam()`.
- Binds `cameraStream` to the video element.
- Runs MediaPipe inference only when monitoring is active, camera is enabled, AI is loaded, video data is ready, and a model ref exists.
- Throttles inference through `inferenceFps`.
- Prevents overlapping inference with an `inferenceRunning` guard.
- Tracks `hasDetectedFace` from `faceResults?.faceLandmarks?.length > 0`.
- Draws real face and hand landmarks to canvas when detections exist.
- Keeps the canvas empty when monitoring is paused, the camera is disabled, or AI is loaded and no face is detected.
- Displays `No Face Detected` through React UI state.
- Displays a simple loading fallback face only before AI models are loaded.
- Supports `monitor` and `focus-panel` presentations from the same inference implementation.
- In `focus-panel`, keeps the video element mounted for inference while visually hiding real camera pixels and showing the landmark canvas.

### DebugPanel

`src/components/DebugPanel.js` is a developer diagnostics overlay rendered from the product layout when Debug Mode is enabled. It is closed by default and opens as a responsive right-side drawer on desktop or bottom sheet on narrow screens, so it does not permanently resize Study Space.

The panel provides:

- Read-only system status for camera, MediaPipe FaceLandmarker, MediaPipe GestureRecognizer, affect model, face detection, Monitoring, active session state, repository type, data quality, and latest formal sample age.
- Live metric inspection for the authoritative pipeline values: attention, fatigue, valence, affect arousal, detected emotion, top softmax probability stored as `emotionConfidence`, face/hand detection state, latest observation time, and latest formal sample time.
- A memory-only estimator diagnostic snapshot updated at about one-second cadence while live inference is running. It exposes already-calculated attention, fatigue, affect, gesture, aggregation-quality, and performance intermediates with validity, staleness, source, update-time, and gate-reason labels.
- A memory-only Debug Simulation mode with normalized display-preview values for attention, fatigue, valence, arousal, emotion, emotion confidence, face state, and data quality. These values are labeled as simulated and are selected through a display boundary rather than being written to authoritative metric state.
- Session diagnostics for the current session ID, status, elapsed active time, durable accumulated time, recovery-pending state, checkpoint status, sample count, camera/Monitoring state, and in-memory telemetry counts.
- A bounded, sanitized, memory-only event log with Clear Log and Copy Sanitized Log actions.
- Collapsed advanced controls for live inference FPS and collapsed sensitive-data tools for face-crop preview and raw landmark CSV export. The sensitive preview is off by default, clears when Debug Mode closes, and export requires confirmation.

Debug Simulation and display overrides are cleared when Debug Mode is turned off and are not persisted across refreshes. They must not enter `MetricObservation`, formal `MetricSample` records, session statistics, completed history, IndexedDB, or model output.

### DashboardCharts

`src/components/DashboardCharts.js` renders dashboard visuals with inline SVG:

- Metric cards for attention, fatigue, valence, and affect arousal.
- Behavioral and emotional trend charts based on active live metrics or completed session samples. Emotional Engagement uses a continuous valence-arousal plot without discrete emotion regions.
- An expanded Emotional Engagement analysis dialog for active sessions and the latest completed session. The dialog shows the enlarged VA trajectory plus an expression-interval distribution computed from stored top-1 classifier labels.
- Session summary, metric stream, and completed-history detail views.

## AppContext Responsibilities

`src/context/AppContext.js` is the central client-side state provider. It owns:

- Global UI mode: Debug Mode.
- Monitoring, camera, and shared session-clock state.
- MediaPipe model loading state and model refs.
- Inferred behavioral metrics: attention and fatigue.
- Browser affect state: valence, affect arousal, discrete emotion, and top softmax probability stored as `emotionConfidence`.
- CV telemetry: blink rate, yawn count, head pose, current gesture, measured processing FPS, and MediaPipe inference latency.
- Developer diagnostics state: read-only live debug metrics, memory-only diagnostic snapshots, memory-only simulated display metrics, camera/model statuses, checkpoint write status, sensitive preview visibility, and a bounded sanitized event log.
- Metrics history for charts.
- Telemetry table and raw landmark history.
- Camera start/stop lifecycle.
- Monitoring toggle lifecycle.
- Metric reset.
- CSV export.
- Real MediaPipe-derived telemetry processing through `updateAiMetrics()`.
- Simulation fallback when monitoring is active but real tracking is unavailable.

## High-Level Data Flow

```text
User enables camera
  -> AppContext.startCamera()
  -> CameraFeed binds stream to video
  -> AppContext loads MediaPipe models
  -> CameraFeed samples video frames
  -> FaceLandmarker / GestureRecognizer run in browser
  -> CameraFeed updates detection refs and face-detected UI state
  -> AppContext.updateAiMetrics() updates telemetry and metrics
  -> Monitor page or Focus Space displays advice/current state
  -> DebugPanel can inspect live state or preview memory-only simulated display metrics
  -> DashboardCharts visualizes current and historical metrics
```

## Canvas Versus React Overlay Responsibilities

Canvas is responsible for:

- Real MediaPipe face contours, iris contours, mesh dots, and hand skeletons.
- The temporary loading fallback face and loading/warning messages before AI models are loaded.

React overlays are responsible for:

- Camera offline UI.
- Monitoring paused UI.
- `No Face Detected` state.
- Buttons and controls.

This separation is intentional: no-face state is a React UI message, not simulated canvas tracking.

## Dashboard and Telemetry Flow

`updateAiMetrics()` creates rows for `telemetryTable` and entries for `rawLandmarksHistory`. It also updates a read-only diagnostic snapshot at about one-second cadence from already-computed estimator intermediates such as face coverage, forward-pose score, head-stability score, EAR baseline progress, PERCLOS, blink-rate comparison, hand count, gesture summary, data-quality coverage, and MediaPipe latency. `DebugPanel` can show aggregate counts and exposes the raw landmark CSV only inside the collapsed sensitive-data section with confirmation; it does not display raw coordinate matrices inline. `activeSessionLiveMetrics` is updated on an interval while Monitoring is active, and `DashboardCharts` uses that state plus formal session samples for live and historical views.

## Privacy Boundaries

- Video processing is designed to run locally in the browser.
- No backend upload route for camera frames is defined in the current repository.
- The normal Monitor presentation shows the real camera preview when enabled.
- The Focus panel presentation hides real camera pixels but keeps the video element available for local inference and face cropping.
- Raw landmark CSV export and face-crop preview can include biometric-derived data. They are hidden behind collapsed sensitive developer controls, require explicit action, remain memory-only unless the CSV is exported by the user, and are cleared from view when Debug Mode closes.

## Session Domain Layer

`src/services/session/` defines the first durable, framework-independent session-history model. It is intentionally outside React components and outside `AppContext` so future Dashboard, persistence, and summary algorithms can evolve without changing the browser-local AI inference pipeline.

The domain separates four levels of data:

- `MetricObservation`: short-lived inference observations that can be aggregated later. These are not intended for durable storage.
- `MetricSample`: future interval records, approximately 5 seconds each, containing means for attention, fatigue, valence, and arousal plus data coverage and data-quality metadata.
- `SessionStatistics`: descriptive statistics computed across a completed session's interval samples.
- `SessionSummary`: structured, replaceable rule-based summary sections generated from session-level statistics.

Stored session records use `attention` as the canonical behavioral metric name. The session model does not include legacy `stress` or a legacy 0-100 arousal value. Its `arousal` field refers to the browser-local EmotiEffLib continuous valence-arousal output and may be `null` when affect data is missing.

`repositories/sessionRepository.js` documents an asynchronous repository contract compatible with future `study_sessions` and `metric_samples` tables. `memorySessionRepository.js` implements the same contract for deterministic isolated use while keeping sessions and metric samples separate. `indexedDbSessionRepository.js` implements the same contract with native browser IndexedDB and is injected by `AppContext` as the application repository. A future Supabase repository should be able to replace these implementations without making React components depend on the storage backend.

The session persistence boundary excludes camera images, face crops, face landmarks, hand landmarks, ONNX tensors, model logits, full emotion probability arrays, raw MediaPipe matrices, debug logs, full telemetry rows, and raw biometric coordinate exports. Persisted session data contains completed study-session summaries, formal interval metric samples with derived fields such as attention, fatigue, valence, arousal, emotion, emotion confidence, data quality, and coverage metadata, and the minimum active-session timing fields needed for local interruption recovery.

Schema, pipeline, aggregation, and summary algorithm versions are stored with session records so historical sessions remain interpretable after algorithms change. Future re-analysis should be explicit rather than silently overwriting old summaries. VA coordinates are continuous affect values; the model's categorical expression must come from EmotiEffLib top-1 classifier output rather than being inferred from valence-arousal coordinates.

## Persistence

Completed study-session summaries and formal `MetricSample` records are stored locally in IndexedDB using the `aegismind-session-data` database. Active sessions also update durable timer checkpoints about every five seconds while the study clock is running. This lets completed history and one interrupted active session survive refreshes on the same browser and origin. The storage is local browser persistence only; it is not cloud synchronization, authentication, Supabase, or durable report storage.

Raw video, images, face crops, canvas contents, face landmarks, hand landmarks, raw telemetry rows, raw landmark history, model logits, full emotion probability arrays, debug overrides, MediaPipe model objects, and camera streams are not stored in IndexedDB. Raw telemetry and landmark history remain in React memory unless the user explicitly exports the CSV.

On startup, an unexpectedly interrupted active session is converted to a paused, recovery-pending session and shown over the normal Study Space in a modal. The recovered elapsed time comes only from the latest durable checkpoint; refresh time and time spent viewing the recovery modal are excluded. Returning from the recovery modal keeps the session paused. Resuming preserves the same session ID but requires the user to grant camera access successfully before the study clock, Monitoring, and data analysis restart.

Clearing browser site data removes local session history and any recoverable session. Private/incognito browsing modes or browser storage restrictions may prevent durable persistence. Abrupt termination can lose up to roughly one checkpoint interval. Recovery is local-only, preserves already committed `MetricSample` records, and does not restore camera streams, short-term baselines, pending observations, raw telemetry, landmarks, or model state.

## Developer Diagnostics And Simulation

Debug Mode is intended for local developer inspection of the browser camera/model/session pipeline. The diagnostics entry point is available in development builds. The diagnostics drawer reads existing AppContext and session-runtime state; opening it does not start the camera, request permissions, load extra models, start Monitoring, start a session, or write session data.

The diagnostic snapshot distinguishes `N/A`, `Idle`, `Stale`, `Collecting baseline`, `Insufficient face coverage`, `Insufficient observations`, and `Model unavailable` states so startup placeholders are not presented as authoritative live measurements. MediaPipe inference latency and affect-model inference latency are shown separately. The emotion probability label refers to top softmax probability, not calibrated confidence, while the persisted session field remains named `emotionConfidence` for compatibility.

The simulation controls are deliberately separated from authoritative metrics:

```text
displayMetrics = simulationEnabled ? simulatedMetrics : liveMetrics
```

`liveMetrics` are derived from current AppContext state and session sample timestamps. `simulatedMetrics` are normalized memory-only values for previewing future UI consumers. The current Dashboard, completed history, session statistics, repository writes, checkpoint timing, emotion model, attention estimator, and fatigue estimator continue to use authoritative live data only.

The diagnostic event log is bounded to approximately 100 entries, coalesces immediate duplicates, sanitizes copied text, and remains in memory. It must not contain camera frames, face crops, landmarks, raw observations, model logits, full probability arrays, tokens, stack traces, or persisted user data. Diagnostic snapshots, simulation values, crop previews, and sensitive export buffers are excluded from formal samples, statistics, checkpoints, completed history, and IndexedDB.

## Emotional Engagement Charts

The Emotional Engagement VA chart shows only the continuous valence-arousal coordinate space, axes, trajectory points, start/current-final markers, and mean marker. It no longer renders hardcoded discrete-emotion regions because those regions could imply that expressions are inferred from VA coordinates.

Collapsed active and end-session Emotional Engagement cards are non-interactive overviews: no point hover, no tooltip, and no expression distribution. Active and latest completed sessions can open the expanded analysis dialog. Inside that dialog only, point hover shows interval time, valence, arousal, stored top expression, stored top probability when present, and data quality. The probability is the interval's top softmax probability, not calibrated confidence.

The expression distribution is available only in the expanded active/end-session dialog. It counts each valid classified affect interval once by its stored top-1 expression, excludes invalid, missing, or unclassified affect intervals from the denominator, and does not weight bars by `emotionConfidence` or reconstruct full probability vectors. Historical report modals keep a static VA trajectory and show no expand action, point tooltip, or expression distribution. No schema or full probability-vector persistence was added.

