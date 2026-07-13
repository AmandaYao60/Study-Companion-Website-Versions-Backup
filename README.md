# AegisMind AI Study Companion

AegisMind is a privacy-focused Next.js proof of concept for webcam-assisted study monitoring. It runs MediaPipe vision models in the browser to observe face landmarks, blink-related blendshapes, head pose, and hand gestures, then maps those signals into live study-session metrics such as focus, stress, fatigue, and arousal.

The project is documentation-driven: current behavior must be verified against the source files in this repository, especially `src/components/CameraFeed.js` and `src/context/AppContext.js`.

## Current Features

- Overview page describing the AegisMind concept and privacy model.
- Study Space page with camera permission flow, monitoring controls, Privacy Shield, and companion feedback.
- Real MediaPipe face landmark inference through `@mediapipe/tasks-vision`.
- MediaPipe gesture recognition configured for up to two hands.
- Canvas rendering of real face and hand landmarks when a face is detected.
- Explicit Disable Webcam control that stops the media stream and clears video state.
- Empty canvas when monitoring is paused or the camera is disabled.
- React `No Face Detected` overlay when AI is loaded but no face is detected.
- Debug panel for sampler FPS, manual metric overrides, event injection, telemetry table, and CSV export.
- Analytics dashboard with SVG gauges, timeline chart, radar chart, and session summaries.
- Simulation fallback only when real tracking is unavailable, such as while monitoring without camera/model availability.

## Technology Stack

- Next.js `16.2.9`
- React `19.2.4`
- Tailwind CSS `4`
- MediaPipe Tasks Vision `0.10.35`
- Browser WebRTC camera API
- Canvas 2D overlays
- Inline SVG charts
- React Context for client-side state

## Installation

```bash
npm install
```

## Development Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```

Open `http://localhost:3000` after starting the development server.

## Privacy Approach

Camera frames are used locally in the browser for MediaPipe inference. The app does not define a backend upload path for video or image data. Privacy Shield blurs the live video layer while keeping real landmark rendering visible above a dark background layer. CSV export can include face and hand landmark coordinates, so exported files should still be treated as sensitive biometric-derived data.

## Documentation

- [Project status](PROJECT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [AI pipeline](docs/AI_PIPELINE.md)
- [Decisions](docs/DECISIONS.md)
- [Changelog](CHANGELOG.md)
- [Archived Phase 1 review](docs/archive/CODEBASE_REVIEW_PHASE1.md)

## Current Limitations

- Metrics are heuristic and should not be treated as clinical or psychological diagnosis.
- Session data is stored in React state and is lost on refresh unless exported manually.
- PDF report export is currently a placeholder alert.
- Some UI strings in source files still contain mojibake from prior encoding issues.
