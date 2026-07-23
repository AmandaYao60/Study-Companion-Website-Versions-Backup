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

Decision: Sustained two-hand activity logs a warning and slightly reduces focus after 10 frames.

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

Consequences or trade-offs: Recovery is local to the same browser and origin, may lose up to roughly one checkpoint interval, and does not restore webcam streams, Monitoring, short-term baselines, pending observations, raw telemetry, landmarks, or model state. Resume preserves the same session ID and starts the study clock from the checkpoint while leaving webcam and Monitoring disabled for manual restart.
