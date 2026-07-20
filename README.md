# AegisMind AI Study Companion

AegisMind is a privacy-focused Next.js proof of concept for webcam-assisted study monitoring. It runs MediaPipe vision models and browser-side ONNX affect inference locally to observe face landmarks, head pose, hand gestures, and valence-arousal cues, then maps those signals into live study-session metrics such as focus, stress, fatigue, and arousal.

The project is documentation-driven: current behavior must be verified against the source files in this repository, especially `src/components/CameraFeed.js`, `src/context/AppContext.js`, and `src/services/affect/`.

## Current Features

- Overview page describing the AegisMind concept and privacy model.
- Study Space page with camera permission flow, monitoring controls, real camera preview, and companion feedback.
- Focus Space route with a lightweight visual-stage placeholder, fullscreen controls, and a floating landmarks-only monitor panel.
- Real MediaPipe face landmark inference through `@mediapipe/tasks-vision`.
- MediaPipe gesture recognition configured for up to two hands.
- Browser-local EmotiEffLib ONNX affect inference through `onnxruntime-web`.
- Canvas rendering of real face and hand landmarks when a face is detected.
- Explicit Disable Webcam control that stops the media stream and clears video state.
- Empty canvas when monitoring is paused or the camera is disabled.
- React `No Face Detected` overlay when AI is loaded but no face is detected.
- Debug panel for sampler FPS, manual metric overrides, event injection, telemetry table, and CSV export.
- Analytics dashboard with SVG gauges, timeline chart, radar chart, and session summaries.
- Simulation fallback only when real tracking is unavailable, such as while monitoring without camera/model availability.

## Technology Stack

- Next.js `16.2.10`
- React `19.2.4`
- Tailwind CSS `4`
- MediaPipe Tasks Vision `0.10.35`
- ONNX Runtime Web `1.27.0`
- Browser WebRTC camera API
- Canvas 2D overlays
- Inline SVG charts
- React Context for client-side state

## Installation

```bash
npm install
```

The browser affect model is loaded from `public/models/emotieff/enet_b0_8_va_mtl.onnx`. No separate Python affect service is required for the current browser pipeline.

## Development Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```

Open `http://localhost:3000` after starting the development server.

## Privacy Approach

Camera frames are processed locally in the browser. MediaPipe face/gesture inference and EmotiEffLib ONNX affect inference run on the client through browser APIs and `onnxruntime-web`; face images are not uploaded to a backend service and are not stored by the application. The Focus Space floating monitor hides real camera pixels while keeping the same live landmark canvas and inference pipeline active. CSV export can include face and hand landmark coordinates, so exported files should still be treated as sensitive biometric-derived data.

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
- The final Focus Space particle environment and task system are not implemented yet.
- Some UI strings in source files still contain mojibake from prior encoding issues.
