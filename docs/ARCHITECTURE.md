# Architecture

This document describes the current repository structure and runtime organization. It is based on the files in the current working tree.

## Application Structure

```text
src/
  app/
    layout.js
    page.js
    monitor/page.js
    dashboard/page.js
    globals.css
  components/
    Navbar.js
    CameraFeed.js
    DebugPanel.js
    DashboardCharts.js
  context/
    AppContext.js
```

The app uses the Next.js App Router. `src/app/layout.js` defines the root HTML shell, loads Geist fonts, imports `globals.css`, wraps the app in `AppProvider`, and renders `Navbar` above route content.

## Primary Pages

- `src/app/page.js`: Overview page. Presents the Phase 1 POC, feature cards, privacy approach, and links to Study Space and Analytics.
- `src/app/monitor/page.js`: Study and monitoring workspace. Combines `CameraFeed`, companion advice, session timer, and either `DebugPanel` or a production sidebar.
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
- Uses a Privacy Shield background layer while preserving real landmark drawing.

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

- Global UI mode: Debug Mode and Privacy Shield.
- Monitoring and camera state.
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
  -> Monitor page displays advice and current state
  -> DebugPanel displays telemetry and controls
  -> DashboardCharts visualizes current and historical metrics
```

## Canvas Versus React Overlay Responsibilities

Canvas is responsible for:

- Real MediaPipe face contours, iris contours, mesh dots, and hand skeletons.
- The Privacy Shield tracking box computed from real landmarks.
- The temporary loading fallback face and loading/warning messages before AI models are loaded.

React overlays are responsible for:

- Camera offline UI.
- Monitoring paused UI.
- `No Face Detected` state.
- Privacy Shield background layer.
- Buttons and controls.

This separation is intentional: no-face state is a React UI message, not simulated canvas tracking.

## Dashboard and Telemetry Flow

`updateAiMetrics()` creates rows for `telemetryTable` and entries for `rawLandmarksHistory`. `DebugPanel` reads these structures for the telemetry table and CSV export. `metricsHistory` is updated on an interval while monitoring is active, and `DashboardCharts` uses that history for the timeline and summary cards.

## Privacy Boundaries

- Video processing is designed to run locally in the browser.
- No backend upload route for camera frames is defined in the current repository.
- Privacy Shield blurs the video element and places a dark background layer below the canvas.
- Real landmarks can still be rendered while Privacy Shield is active.
- Raw landmark CSV export can include biometric-derived coordinate data and should be handled carefully.

## Persistence Limitations

The app currently stores session state in React memory. Reloading the page clears metrics history, telemetry rows, raw landmarks, event logs beyond initial defaults, and camera state. There is no IndexedDB, SQLite, backend database, or durable report storage in the current code.
