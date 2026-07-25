# Changelog

All notable project changes should be documented in this file.

This project follows the structure of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), but no release versions or dates are assigned yet.

## Unreleased

### Added

- Added standalone `/focus` Focus Space route with a lightweight visual-stage placeholder.
- Added a draggable floating monitor panel that reuses `CameraFeed` in `focus-panel` presentation.
- Added shared session clock state so `/monitor` and `/focus` show consistent elapsed time.
- Real browser-side MediaPipe face landmark inference through `@mediapipe/tasks-vision`.
- MediaPipe gesture recognition configured for up to two hands.
- Explicit Disable Webcam control in `CameraFeed`.
- React `hasDetectedFace` state and `No Face Detected` overlay.
- Simple AI-loading fallback face and delayed troubleshooting message.
- Multi-hand landmark persistence with separate `handId` values.
- Per-hand top-gesture extraction with highest-confidence primary gesture selection.
- Sustained two-hand activity warning and weak attention-reduction heuristic.
- Telemetry table and raw landmark CSV export.
- Optional regular-break planning in Session Setup with focused-time scheduling, break warnings, Start/Skip decisions, Focus Space Break Mode, extension handling, and coordinated local audio.

### Changed

- Camera canvas rendering now depends on active monitoring, enabled camera, AI loading state, and real detection state.
- Gesture effects are applied once per unique detected gesture name instead of once per hand candidate.
- `stopCamera` also stops monitoring state.
- Documentation now treats current source files as the only source of truth.
- Updated Next.js and `eslint-config-next` from 16.2.9 to 16.2.10.
- Added `onnxruntime-web` for planned browser-based affect inference.
- Dashboard now treats active and paused current sessions as the main source, uses the latest completed session only when no current session exists, and opens historical rows in a static report modal.
- Dashboard charts now use formal five-second `MetricSample` records instead of duplicate live-history rows.
- Pausing an active session now force-flushes useful pending observations into a final partial sample.
- Debug telemetry and raw-landmark capture are bounded, memory-only, and gated behind Debug Mode sensitive controls.
- Replaced the monolithic app-state consumer hook with focused Session, Monitoring, and Debug hooks.
- Added backward-compatible session-plan, planned-break, and interruption data contracts plus pure break lifecycle helpers.
- Timed breaks now use effective focused-study time, stop camera/inference only after the user starts a break, suppress formal samples during break phases, and persist break events separately from manual pauses.

### Known Issues

- The PostCSS advisory GHSA-qx2v-qp2m-jg93 remains present through
  Next.js's internal dependency. No compatible automated fix is currently
  available.

### Fixed

- Prevented overlapping inference calls with an `inferenceRunning` guard.
- Reset cached detections and face detection state during inference cleanup.
- Avoided drawing fallback landmarks when AI is loaded but no face is detected.
- Avoided drawing canvas overlays while monitoring is paused or the camera is disabled.
- Removed redundant unbounded active-session live metric history from the dashboard data flow.

### Removed

- Removed Privacy Mode / Privacy Shield UI and inference guards; Focus Space now owns the landmarks-only presentation.
- Old animated simulated `baseLandmarks` face mesh behavior from `CameraFeed`.
- Simulated camera-overlay blinking, yawning, head-pose movement, micro-jitter, fake mesh connections, and fake fallback tracking boxes from `CameraFeed`.
- Current-architecture claims that MediaPipe integration is future work.
