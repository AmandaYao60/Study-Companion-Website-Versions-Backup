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
- `src/app/monitor/page.js`: Technical camera and calibration workspace. Combines `CameraFeed`, companion advice, shared session timer, and either `DebugPanel` or a production sidebar.
- `src/app/focus/page.js`: Focus Space shell. Renders a fullscreen-capable visual-stage placeholder and, while monitoring is active, a draggable floating monitor panel that reuses `CameraFeed` in `focus-panel` presentation.
- `src/app/dashboard/page.js`: Analytics view. Renders `DashboardCharts`, session diagnosis copy, debug sliders when Debug Mode is enabled, and placeholder PDF export.

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

`src/components/DebugPanel.js` provides:

- Inference FPS control.
- Manual focus, stress, fatigue, and arousal overrides.
- Event injectors for blink, yawn, and selected gestures.
- Raw telemetry summaries.
- Telemetry table view.
- CSV export through `exportTelemetryCSV()`.
- Event log console and custom log injection.

### DashboardCharts

`src/components/DashboardCharts.js` renders dashboard visuals with inline SVG:

- Circular gauges for focus, stress, fatigue, and arousal.
- Smoothed session timeline for focus, stress, and fatigue.
- Radar chart for current cognitive balance.
- Summary cards for average focus, average stress, and peak fatigue.

## AppContext Responsibilities

`src/context/AppContext.js` is the central client-side state provider. It owns:

- Global UI mode: Debug Mode.
- Monitoring, camera, and shared session-clock state.
- MediaPipe model loading state and model refs.
- Cognitive metrics: focus, stress, fatigue, arousal.
- CV telemetry: blink rate, yawn count, head pose, current gesture, FPS, latency.
- Event log.
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
  -> DebugPanel displays telemetry and controls
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

`updateAiMetrics()` creates rows for `telemetryTable` and entries for `rawLandmarksHistory`. `DebugPanel` reads these structures for the telemetry table and CSV export. `metricsHistory` is updated on an interval while monitoring is active, and `DashboardCharts` uses that history for the timeline and summary cards.

## Privacy Boundaries

- Video processing is designed to run locally in the browser.
- No backend upload route for camera frames is defined in the current repository.
- The normal Monitor presentation shows the real camera preview when enabled.
- The Focus panel presentation hides real camera pixels but keeps the video element available for local inference and face cropping.
- Raw landmark CSV export can include biometric-derived coordinate data and should be handled carefully.

## Session Domain Layer

`src/services/session/` defines the first durable, framework-independent session-history model. It is intentionally outside React components and outside `AppContext` so future Dashboard, persistence, and summary algorithms can evolve without changing the browser-local AI inference pipeline.

The domain separates four levels of data:

- `MetricObservation`: short-lived inference observations that can be aggregated later. These are not intended for durable storage.
- `MetricSample`: future interval records, approximately 10 seconds each, containing means for attention, fatigue, valence, and arousal plus data coverage and data-quality metadata.
- `SessionStatistics`: descriptive statistics computed across a completed session's interval samples.
- `SessionSummary`: structured, replaceable rule-based summary sections generated from session-level statistics.

Stored session records use `attention` as the canonical future Dashboard metric name. The existing live estimator still exposes `focus` in `AppContext`; that mapping is deliberately left for a later integration phase. The new model does not include the current Dashboard's `stress` metric or the old simulated 0-100 arousal value. Its `arousal` field refers to the browser-local EmotiEffLib continuous valence-arousal output and may be `null` when affect data is missing.

`repositories/sessionRepository.js` documents an asynchronous repository contract compatible with future `study_sessions` and `metric_samples` tables. `memorySessionRepository.js` implements the same contract for deterministic local use while keeping sessions and metric samples separate. A future Supabase repository should be able to replace the memory implementation without making React components depend on the storage backend.

The session persistence boundary excludes camera images, face crops, face landmarks, hand landmarks, ONNX tensors, model logits, raw MediaPipe matrices, debug logs, full telemetry rows, and raw biometric coordinate exports. Persisted session data should contain only aggregated user-facing study metrics and required metadata.

Schema, pipeline, aggregation, and summary algorithm versions are stored with session records so historical sessions remain interpretable after algorithms change. Future re-analysis should be explicit rather than silently overwriting old summaries. `circumplexConfig.js` contains illustrative emotion reference regions for later charting; they are not diagnostic boundaries, and the model's categorical emotion must come from EmotiEffLib rather than being inferred solely from valence-arousal coordinates.

## Persistence Limitations

The app currently stores session state in React memory. Route changes preserve the shared session clock while the provider remains mounted, but reloading the page clears metrics history, telemetry rows, raw landmarks, event logs beyond initial defaults, and camera state. There is no IndexedDB, SQLite, backend database, or durable report storage in the current code.

