<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may differ from memory or older training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repository Safeguards

Before making changes, future coding agents must:

- Read `PROJECT_STATUS.md`.
- Inspect the current source files that are relevant to the requested change.
- Check `git diff` before editing when `git` is available.
- Treat the current working tree as the only source of truth.
- Avoid relying on previous AI conversations, earlier generated reviews, or remembered file versions.
- Make the smallest necessary change.
- Avoid unrelated refactoring.
- Preserve the current `CameraFeed.js` state behavior unless the user explicitly asks to change it.
- Run `npm run lint`.
- Run `npm run build`.
- Report every changed file.
- Avoid committing unless the user explicitly requests a commit.

## Protected CameraFeed Behavior

Preserve these current behaviors unless the user explicitly asks for a behavior change:

- Real MediaPipe face landmarks are rendered when detected.
- Gesture recognizer output can include up to two hands.
- The webcam can be explicitly disabled.
- Canvas rendering stops when the camera is disabled.
- Canvas rendering stops when monitoring is paused.
- The AI-loading fallback is intentionally simple.
- The old animated simulated landmark system must not be restored.
- When AI is loaded but no face is detected, fallback landmarks are not drawn.
- `No Face Detected` is rendered through React UI state.
- Privacy Shield uses a background layer and keeps real landmark rendering.
- AppContext stores multi-hand landmarks with separate `handId` values.
