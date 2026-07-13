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

## Privacy Shield Does Not Use a Centered Duplicate Message

Decision: Privacy Shield uses a background layer and badge, not a centered duplicate privacy message.

Rationale: The user already opted into Privacy Shield; the primary visual should stay on landmark rendering.

Consequences or trade-offs: The interface is less repetitive, but Privacy Shield status depends on the badge/background treatment.

## AI-Loading Fallback Is Intentionally Simple

Decision: The pre-load fallback is a static face and loading/warning message.

Rationale: A simple placeholder communicates waiting without pretending that real tracking is active.

Consequences or trade-offs: It is less visually dynamic than the removed animation, but more honest.

## Real Landmarks Drive the Privacy Tracking Box

Decision: Privacy Shield bounding boxes are calculated from real MediaPipe landmarks.

Rationale: The box should represent actual detection geometry.

Consequences or trade-offs: No box appears if no face is detected after AI has loaded.

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
