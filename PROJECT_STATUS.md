# Project Status

## Current Phase

Phase 1 proof of concept: local browser-based study monitoring with real MediaPipe face and gesture inference, a privacy-first camera UI, debug telemetry, and dashboard visualization.

## Completed

- Real MediaPipe `FaceLandmarker` loading through `@mediapipe/tasks-vision`.
- Real MediaPipe `GestureRecognizer` loading with `numHands: 2`.
- Camera permission flow using `navigator.mediaDevices.getUserMedia`.
- Explicit Disable Webcam control that pauses video, clears `srcObject`, stops tracks, clears detection state, disables Privacy Shield, and stops monitoring through `stopCamera`.
- Canvas rendering stops when the camera is disabled or monitoring is paused.
- Real face contour, eye, brow, lip, iris, mesh-dot, and hand skeleton rendering when detections exist.
- React `No Face Detected` overlay when monitoring is active, camera is enabled, AI is loaded, and no face landmarks are returned.
- Simple AI-loading fallback face plus loading/delayed-warning canvas messages before models are ready.
- Privacy Shield blur/background layer with real landmark rendering and real-landmark bounding box.
- AppContext telemetry from face blendshapes, facial transformation matrices, gestures, face landmarks, and multi-hand landmarks.
- Rolling telemetry table and CSV export for raw face/hand landmark coordinates.
- Dashboard SVG gauges, line chart, radar chart, and summary statistics.

## In Progress

- Improving the accuracy and cooldown behavior of heuristic metric updates.
- Clarifying scientific limitations of focus, fatigue, stress, and arousal inference.
- Keeping documentation aligned with the current source code.

## Next Tasks

- Run browser QA with camera permissions on supported browsers.
- Decide whether two visible hands should always reduce focus after sustained detection.
- Add cooldowns or aggregation to gesture logs and metric effects.
- Add local persistence if session history should survive refresh.
- Replace PDF export placeholder with a real report export path.
- Fix mojibake UI strings in source files in a separate source-code task.
- Add tests for metric heuristics and critical UI state transitions.

## Known Issues

- `git` is not available on PATH in the current shell environment.
- Metrics are heuristic and not clinically validated.
- Stress and arousal are only partially grounded in observed CV signals.
- The fallback simulation in `AppContext.js` can still update metrics when monitoring runs without real tracking.
- Telemetry is stored in React state and is lost on page refresh unless exported.
- CSV exports contain landmark coordinates and should be handled as sensitive data.
- Some source strings display mojibake characters.

## Protected Behaviors

- Do not restore the old animated simulated `baseLandmarks` camera mesh.
- Do not draw fallback landmarks after AI has loaded and no face is detected.
- Do not draw canvas overlays when monitoring is paused.
- Do not draw canvas overlays when the camera is disabled.
- Keep `No Face Detected` as a React overlay state.
- Keep Privacy Shield as a background layer with real landmark rendering above it.
- Preserve multi-hand landmark storage with separate `handId` values.
- Preserve explicit webcam disable behavior.

## Important Files

- `src/components/CameraFeed.js`
- `src/context/AppContext.js`
- `src/components/DebugPanel.js`
- `src/components/DashboardCharts.js`
- `src/components/Navbar.js`
- `src/app/page.js`
- `src/app/monitor/page.js`
- `src/app/dashboard/page.js`
- `docs/ARCHITECTURE.md`
- `docs/AI_PIPELINE.md`
- `docs/DECISIONS.md`
