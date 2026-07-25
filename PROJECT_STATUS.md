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
- AppContext derives telemetry from face blendshapes, facial transformation matrices, gestures, face landmarks, and multi-hand landmarks without continuously storing raw coordinates in ordinary React state.
- Debug Mode keeps a bounded telemetry table and opt-in sensitive raw-landmark CSV export for approximately the latest 50 captured frames.
- Dashboard metric cards, five-second sample charts, current-session analysis, latest-completed analysis, historical report modal, and summary statistics.
- Completed study-session summaries and formal metric samples persist locally in browser IndexedDB on the same origin.
- Active study sessions save local timer checkpoints about every five seconds and can be recovered after refresh as paused sessions.
- Pausing an active session force-flushes useful pending observations into a final partial `MetricSample` before the Dashboard renders the paused current session.
- App state is exposed through focused Session, Monitoring, and Debug contexts rather than a single monolithic consumer hook.
- The session domain normalizes optional `sessionPlan`, `breakEvents`, and `interruptions` fields for regular timed breaks.
- Optional regular breaks can be planned in Session Setup, scheduled by effective focused-study time, shown in Focus Space Break Mode, extended up to three times, and persisted as break events separate from pauses.
- Study Workspace now starts with a calm welcome/setup flow when no active session exists, then collects optional one-card-at-a-time check-in data before preparing the existing camera-gated session.
- Ending a study session opens an optional one-card-at-a-time reflection before the existing completion write; partial reflection answers are preserved and unanswered fields remain blank.
- Debug Mode exposes a development-only diagnostics drawer with read-only pipeline status, one-second memory-only diagnostic snapshots, live metric explanations, isolated simulated display metrics, sensitive-data safeguards, and a sanitized bounded event log.
- Emotional Engagement charts use continuous VA trajectories without hardcoded discrete-expression regions. Active, paused, and latest completed main Dashboard sessions have an expanded analysis dialog with interval tooltips and expression distribution; historical reports remain static.

## In Progress

- Improving the accuracy and cooldown behavior of heuristic metric updates.
- Clarifying scientific limitations of heuristic behavioral metrics and affect-model outputs.
- Keeping documentation aligned with the current source code.

## Next Tasks

- Run browser QA with camera permissions on supported browsers.
- QA `/focus` fullscreen behavior and floating monitor dragging across desktop/mobile layouts.
- Decide whether two visible hands should always reduce attention after sustained detection.
- Add cooldowns or aggregation to gesture logs and metric effects.
- QA interrupted-session recovery with real camera permissions across supported browsers.
- Replace PDF export placeholder with a real report export path.
- Fix mojibake UI strings in source files in a separate source-code task.
- Add tests for metric heuristics and critical UI state transitions.
- Browser-QA the timed-break experience with real camera permissions and autoplay policies.

## Known Issues

- `git` is not available on PATH in the current shell environment.
- Metrics are heuristic and not clinically validated.
- Raw telemetry and landmark capture are Debug-only, memory-only, bounded, and lost on page refresh unless explicitly exported.
- Completed session history is local-only IndexedDB data; clearing browser site data, private/incognito browsing, or storage restrictions can remove or prevent durable history.
- Interrupted active sessions can lose up to roughly one checkpoint interval. Recovery is local-only and depends on browser IndexedDB availability.
- Recovered or camera-disabled sessions remain paused until the user grants camera access successfully. Continue Study after a planned break attempts to restart webcam and Monitoring automatically, then falls back to the existing paused/recovery flow if permission or camera startup fails.
- Active and paused current sessions are the main Dashboard source. With no current session, the Dashboard uses the latest completed session; historical rows open a static report modal without replacing the main source.
- Debug Simulation values are memory-only display previews; they do not enter formal samples, statistics, completed history, or IndexedDB.
- Debug diagnostic snapshots distinguish valid, idle, stale, baseline-collecting, insufficient-coverage, insufficient-observation, and model-unavailable states; they do not enter formal samples, statistics, completed history, or IndexedDB.
- Expression distributions count only stored top-1 classifier labels from valid affect intervals. They do not infer expressions from VA coordinates or persist full probability vectors.
- CSV exports contain landmark coordinates and should be handled as sensitive data. The Debug Panel keeps raw landmark export and face-crop preview behind collapsed sensitive controls, with crop preview off by default and CSV export requiring confirmation.
- Some source strings display mojibake characters.
- Session check-in and reflection are theory-informed self-report fields only. They are not validated psychological tests, clinical assessments, diagnostic instruments, or learning scores.
- Hidden-tab continuous monitoring and guaranteed background break alarms are not available; timed-break state is recomputed from timestamps when the app runs again.

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
