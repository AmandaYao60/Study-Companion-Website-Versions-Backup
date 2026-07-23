# Project Status

## Current Phase

Phase 2 shell: Phase 1 browser-local inference is frozen, and Focus Space now provides a standalone visual-stage placeholder with a floating landmarks-only monitor panel.

## Completed

- Real MediaPipe `FaceLandmarker` loading through `@mediapipe/tasks-vision`.
- Real MediaPipe `GestureRecognizer` loading with `numHands: 2`.
- Camera permission flow using `navigator.mediaDevices.getUserMedia`.
- Explicit Disable Webcam control that pauses video, clears `srcObject`, stops tracks, clears detection state, resets the session clock, and stops monitoring through `stopCamera`.
- Canvas rendering stops when the camera is disabled or monitoring is paused.
- Real face contour, eye, brow, lip, iris, mesh-dot, and hand skeleton rendering when detections exist.
- React `No Face Detected` overlay when monitoring is active, camera is enabled, AI is loaded, and no face landmarks are returned.
- Simple AI-loading fallback face plus loading/delayed-warning canvas messages before models are ready.
- AppContext telemetry from face blendshapes, facial transformation matrices, gestures, face landmarks, and multi-hand landmarks.
- Rolling telemetry table and CSV export for raw face/hand landmark coordinates.
- Dashboard SVG gauges, line chart, radar chart, and summary statistics.
- Completed study-session summaries and formal metric samples persist locally in browser IndexedDB on the same origin.

## In Progress

- Improving the accuracy and cooldown behavior of heuristic metric updates.
- Clarifying scientific limitations of focus, fatigue, stress, and arousal inference.
- Keeping documentation aligned with the current source code.

## Next Tasks

- Run browser QA with camera permissions on supported browsers.
- QA `/focus` fullscreen behavior and floating monitor dragging across desktop/mobile layouts.
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
- Raw telemetry and landmark history are stored in React state and are lost on page refresh unless exported.
- Completed session history is local-only IndexedDB data; clearing browser site data, private/incognito browsing, or storage restrictions can remove or prevent durable history.
- Interrupted active-session recovery is not implemented; prepared, active, or paused records may remain in local storage but are not automatically resumed, completed, discarded, or shown as completed history.
- CSV exports contain landmark coordinates and should be handled as sensitive data.
- Some source strings display mojibake characters.

### Next.js PostCSS dependency advisory

Next.js 16.2.10 bundles PostCSS 8.4.31, which is flagged by
GHSA-qx2v-qp2m-jg93. No non-breaking npm audit fix is currently
available.

Do not run `npm audit fix --force`, because npm currently proposes
downgrading Next.js to 9.3.3, which would break the current
Next.js 16 and React 19 project setup.

Current mitigation:

- The application does not accept or process user-supplied CSS.
- The advisory is being monitored for a compatible Next.js update.
- Run `npm audit` again before production deployment.

## Protected Behaviors

- Do not restore the old animated simulated `baseLandmarks` camera mesh.
- Do not draw fallback landmarks after AI has loaded and no face is detected.
- Do not draw canvas overlays when monitoring is paused.
- Do not draw canvas overlays when the camera is disabled.
- Keep `No Face Detected` as a React overlay state.
- Preserve multi-hand landmark storage with separate `handId` values.
- Preserve explicit webcam disable behavior.
- Do not reintroduce Privacy Mode; Focus Space hides real pixels only in the floating panel presentation.

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
