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
- Treat the local repository and current branch as the source of truth; do not clone another copy.
- Do not pull, fetch, reset, restore, clean, stash, switch branches, or push unless the user explicitly requests it.
- Preserve unrelated user changes and untracked files.
- Avoid relying on previous AI conversations, earlier generated reviews, or remembered file versions.
- Make the smallest necessary change.
- Avoid unrelated refactoring.
- Do not change dependencies or lockfiles unless the task genuinely requires it.
- Do not introduce a new test framework without approval.
- Preserve the current `CameraFeed.js` state behavior unless the user explicitly asks to change it.
- Run relevant existing tests for the changed area when available.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Report every changed file.
- Report only validation that actually ran.
- Stage intended files explicitly; never use `git add .` or `git add -A`.
- When the user requests a commit, create the requested local commit and do not push.
- Final reports should summarize changes and validation; do not paste the complete `git diff`.
- Avoid committing unless the user explicitly requests a commit.
- Do not run `npm audit fix --force`. It currently proposes downgrading
  Next.js from 16.x to 9.3.3.

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
- AppContext stores multi-hand landmarks with separate `handId` values.
