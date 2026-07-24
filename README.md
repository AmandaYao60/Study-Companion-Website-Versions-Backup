# AegisMind AI Study Companion

AegisMind is a privacy-focused Next.js proof of concept for webcam-assisted study monitoring. It runs MediaPipe vision models and browser-side ONNX affect inference locally to observe face landmarks, head pose, hand gestures, and valence-arousal cues, then maps those signals into study-session metrics such as attention, fatigue, valence, and affect arousal.

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
- Debug panel for sampler FPS, isolated display simulation, diagnostic snapshots, bounded telemetry, and opt-in sensitive CSV export.
- Analytics dashboard with SVG metric cards, five-second sample charts, current-session analysis, latest-completed analysis, historical report modal, and session summaries.
- Browser-local IndexedDB persistence for completed sessions, formal five-second samples, and active-session recovery checkpoints.

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

Formal session history is stored locally in IndexedDB on the same browser and origin. The stored data is limited to study-session records, five-second `MetricSample` records, and active-session timing checkpoints for refresh recovery. Raw video, images, face crops, raw landmarks, raw observations, logits, and full emotion probability vectors are not persisted. Debug telemetry and raw-landmark capture are memory-only, bounded, and available only through explicit Debug Mode sensitive controls.

## Documentation

- [Project status](PROJECT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [AI pipeline](docs/AI_PIPELINE.md)
- [Decisions](docs/DECISIONS.md)
- [Changelog](CHANGELOG.md)
- [Historical metrics data-flow audit](docs/archive/METRICS_DATA_FLOW_AUDIT_2026-07-24.md)
- [Archived Phase 1 review](docs/archive/CODEBASE_REVIEW_PHASE1.md)

## Current Limitations

- Metrics are heuristic and should not be treated as clinical or psychological diagnosis.
- Completed history and recoverable active sessions are local-only; clearing site data, private browsing, or storage restrictions can remove or prevent persistence.
- Abrupt interruption can lose up to roughly one active-session checkpoint interval.
- PDF report export is currently a placeholder alert.
- The final Focus Space particle environment and task system are not implemented yet.
- Some UI strings in source files still contain mojibake from prior encoding issues.
