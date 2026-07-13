# AegisMind Semantic Layer

Last reviewed: 2026-07-11

## Purpose

AegisMind is an AI study companion and emotion-aware interaction project. The current website is a high-fidelity browser POC for webcam-based study monitoring: it estimates focus, stress, fatigue, and arousal from local camera cues, exposes a privacy-first monitoring interface, and visualizes session metrics. The broader project goal from Notion is larger: build an affective-computing system that moves from emotion recognition, to emotion modeling, to adaptive real-time feedback, eventually through a 3D psychological space.

Primary source context:

- The course/project syllabus positions Week 7 around 3D scene deployment, website construction, project delivery, and CI/CD workflow, using GitHub and Netlify as deployment references.
- Week 8 extends the project toward AI emotion recognition, motion capture, portrait/face recognition, MediaPipe Face Emotion, Hugging Face, TensorFlow.js FER models, YOLO, and camera/mobile deployment.
- Earlier project framing defines the full target system as a real-time emotion-aware web app that reads camera emotion, simulates or analyzes physiological arousal, implements an emotion parameter model, drives a Three.js 3D space, and is deployed online.

## Product Scope

### Current Website Scope

The existing site is named `ai-study-companion` and lives at:

`C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main`

It currently supports:

- A marketing/overview page for AegisMind.
- A study monitoring page with webcam permission flow.
- Local MediaPipe model loading through `@mediapipe/tasks-vision`.
- Face landmark and gesture recognition in the browser.
- Canvas-based face and hand mesh overlay.
- Privacy Shield mode that blurs the video feed and foregrounds landmark visualization.
- Production/debug mode switching.
- Manual state overrides for testing.
- Per-frame telemetry table and raw landmark CSV export.
- Session dashboard with SVG gauges, timeline chart, radar chart, and summary metrics.
- Simulated fallback behavior when camera tracking or AI model loading is unavailable.

### Intended Full Project Scope

The Notion project direction points beyond study productivity into a complete emotional feedback loop:

1. Capture input from webcam, facial expression, eye movement, gesture/posture, and simulated or measured physiological signals.
2. Extract features such as blink frequency, eye openness, head pose, facial expression, pupil/gaze behavior, heart rate, respiration, and skin conductance.
3. Map features into emotional dimensions such as Valence, Arousal, Dominance, Stress, Focus, and Fatigue.
4. Estimate the user state, such as calm, pleasant, anxious, stressed, angry, sad, distracted, or fatigued.
5. Adapt a visual environment through color, lighting, movement speed, particle density, scene complexity, fog, and camera motion.
6. Re-monitor the user after a short interval and continue adjusting the intervention until the target state moves toward calm or pleasant.

## Website Structure

```text
src/
  app/
    page.js                 Overview / landing page
    monitor/page.js         Study and monitoring workspace
    dashboard/page.js       Analytics dashboard
    layout.js               Root layout, fonts, AppProvider, Navbar
    globals.css             Tailwind import and root theme tokens
  components/
    Navbar.js               Top navigation, production/debug toggle, status
    CameraFeed.js           Camera permission, video binding, MediaPipe inference, mesh canvas
    DebugPanel.js           State overrides, telemetry table, event injection, CSV export
    DashboardCharts.js      SVG gauges, line chart, radar chart, session summaries
  context/
    AppContext.js           Global state, AI model loader, camera controls, metric engine
```

Top-level project files:

- `package.json`: Next.js, React, Tailwind, ESLint, MediaPipe dependencies and npm scripts.
- `README.md`: still mostly the default create-next-app README and should be updated.
- `codebase_review.md`: useful prior codebase review, but it is partly outdated because the current implementation now includes real MediaPipe model loading rather than only procedural simulation.
- `AGENTS.md`: warns that this Next.js version has breaking changes and local Next docs should be consulted before code changes.

## Application Workflow

### User Workflow

1. User opens the Overview page.
2. User navigates to Study Space.
3. User enables camera access.
4. The browser loads MediaPipe WASM and model assets.
5. User starts the monitoring session.
6. The app samples webcam frames at the configured inference FPS.
7. Face and gesture results update global cognitive and telemetry state.
8. The user can toggle Privacy Shield to blur camera imagery and show only the landmark mesh.
9. The user can enable Debug Mode to inspect raw telemetry, adjust sliders, inject events, and export CSV landmark logs.
10. The user opens Analytics to inspect focus, stress, fatigue, arousal, history, and diagnostic summaries.

### Technical Workflow

1. `AppProvider` initializes global state and calls `loadAiModels()`.
2. `loadAiModels()` dynamically imports `@mediapipe/tasks-vision`, creates a `FilesetResolver`, then initializes `FaceLandmarker` and `GestureRecognizer`.
3. `CameraFeed` requests `navigator.mediaDevices.getUserMedia()`, binds the stream to a video element, and uses `requestAnimationFrame` to sample frames.
4. On each eligible frame, `detectForVideo()` and `recognizeForVideo()` run locally in the browser.
5. `updateAiMetrics()` extracts eye openness, blink events, head pose, gestures, raw face landmarks, hand landmarks, latency, and telemetry rows.
6. Global metrics update `focus`, `stress`, `fatigue`, and `arousal`.
7. `MonitorPage` derives companion advice from current metric thresholds.
8. `DashboardCharts` renders current and historical state through dependency-free SVG charts.
9. `DebugPanel` provides local testing controls and CSV export.

## Semantic Data Model

### Current State Metrics

| Metric | Range | Current meaning | Current source |
| --- | --- | --- | --- |
| `focus` | 0-100 | Study engagement / attention quality | Eye openness, looking-away logic, gesture events, fallback simulation |
| `stress` | 0-100 | Stress or tension level | Primarily simulated/manual today |
| `fatigue` | 0-100 | Tiredness / visual fatigue | Eye closure, long closure, yawn/manual events, fallback simulation |
| `arousal` | 0-100 | Activation / drive | Looking-away logic, simulation/manual |
| `blinkRate` | count/min | Rolling blink count in the last minute | MediaPipe face blendshape blink scores |
| `eyeOpenness` | 0-1 | Eye openness estimate | `eyeBlinkLeft` and `eyeBlinkRight` blendshapes |
| `headPose` | degrees | Yaw, pitch, roll | Facial transformation matrix |
| `currentGesture` | string | Detected or injected gesture | MediaPipe gesture recognizer / debug controls |

### Target Emotion Model

The Notion research framing suggests a fuller affective model:

```text
emotion = {
  valence: -1 to +1,
  arousal: 0 to 1,
  dominance: 0 to 1,
  stress: 0 to 1
}
```

The current website has `arousal` and `stress` but does not yet implement explicit `valence` or `dominance`. It also uses `focus` and `fatigue`, which are strong study-companion concepts but should be mapped into the larger VAD/emotion-regulation model.

Recommended semantic alignment:

- `focus`: attention quality; derived from gaze alignment, head stability, session behavior, and distraction signals.
- `fatigue`: energy depletion; derived from PERCLOS, long eye closures, yawn frequency, and blink patterns.
- `stress`: physiological or affective load; eventually derived from negative valence, arousal, facial tension, and optional rPPG/HRV proxies.
- `arousal`: activation intensity; eventually derived from facial expression, pupil/gaze intensity, heart rate, respiration, and movement tempo.
- `valence`: positive/negative emotional tone; should be added from facial emotion recognition, expression blendshapes, or FER model output.
- `dominance`: sense of control/agency; should be added only if there is a defensible feature model, such as gaze consistency, posture control, head-gaze alignment, or self-report.

## Technical Tools

Current stack:

- Next.js `16.2.9`
- React `19.2.4`
- Tailwind CSS `4`
- ESLint `9` with `eslint-config-next`
- MediaPipe Tasks Vision `0.10.35`
- Browser WebRTC camera API
- Canvas 2D drawing for video overlays and landmark meshes
- Inline SVG for gauges, line charts, and radar charts
- React Context for in-memory app state
- Browser Blob/Object URL download for CSV export

Planned or likely tools from the project scope:

- Three.js for the adaptive 3D psychological environment.
- Netlify, Vercel, or GitHub Pages for deployment.
- GitHub Actions or Netlify build checks for CI/CD.
- TensorFlow.js FER models or Hugging Face-hosted model conversion for client-side emotion recognition.
- IndexedDB, Dexie, or browser SQLite/WASM for local persistence.
- PDF generation through `jspdf`, `html2canvas`, or a serverless report renderer.

## Current Gaps

1. No deployed production URL or CI/CD workflow is documented in the repo.
2. `README.md` is still the default Next.js starter text.
3. The current UX is a study-monitoring app, while the Notion goal is an adaptive emotion-regulation system with a 3D environment.
4. No Three.js scene exists yet.
5. Explicit `valence` and `dominance` are not implemented.
6. Emotion classification is not yet implemented; the app uses landmarks, blink scores, head pose, and gestures.
7. Stress and arousal are only partially grounded in real signals.
8. Telemetry is kept in React state and disappears on reload.
9. PDF report export is a placeholder alert.
10. There are no automated tests visible in the repo.
11. Camera/model behavior needs browser QA across desktop and mobile.
12. Several UI strings contain mojibake characters, likely from encoding issues.

## Next Steps To Complete The Goals

### Week 7: Website Delivery, Deployment, and Workflow

1. Update `README.md` with the real product description, install steps, scripts, privacy model, routes, and known limitations.
2. Add a deployment checklist for Vercel/Netlify, including Node version, build command, output expectations, and camera/HTTPS requirements.
3. Run and fix `npm run lint` and `npm run build`.
4. Add CI with at least install, lint, and build checks.
5. Decide deployment target: Vercel is easiest for Next.js; Netlify is aligned with the syllabus; GitHub Pages may require static export constraints.
6. Verify MediaPipe WASM/model CDN loading in production and document fallback behavior.
7. QA camera permission flow on Chrome, Edge, Safari, and mobile browsers.
8. Replace mojibake text with clean UTF-8 strings.
9. Add a release note or project status section that clearly labels this as Phase 1 POC.
10. Add screenshots or demo GIFs for Overview, Study Space, Debug Mode, Privacy Shield, and Dashboard.

### Week 8: AI Emotion Recognition and Camera Intelligence

1. Add explicit `valence` and `dominance` state fields to `AppContext`.
2. Build a feature-to-emotion mapping layer separate from UI state.
3. Start with MediaPipe face blendshapes for a lightweight emotion proxy.
4. Evaluate whether TensorFlow.js FER or a converted Hugging Face model can run reliably in-browser.
5. Add calibration for neutral face, baseline blink rate, neutral head pose, and lighting.
6. Add temporal smoothing so emotion state does not flicker frame-to-frame.
7. Extend telemetry rows with valence, arousal, stress, confidence, and model source.
8. Add confidence thresholds and "unknown/uncertain" handling.
9. Document privacy boundaries: video frames remain local; exported CSV contains landmarks and should be treated as sensitive biometric-derived data.
10. Add camera/mobile deployment notes because Week 8 explicitly includes model deployment through phone/computer cameras.

### 3D Emotion Regulation Layer

1. Add a `/space` or `/intervention` route for the Three.js environment.
2. Define a stable mapping from emotion parameters to visual parameters:
   - Valence -> color warmth, daylight, positive palette, cloud/fog softness.
   - Arousal -> movement speed, saturation, object count, contrast, particle density.
   - Stress -> jitter, sharpness, density, dark/light extremes, intervention urgency.
   - Fatigue -> brightness comfort, motion reduction, break prompts, calmer rhythm.
3. Use a proven Three.js setup rather than hand-rolled 3D infrastructure.
4. Keep the 3D scene full-screen or primary in the experience, not a decorative preview.
5. Add an intervention loop: detect state, adapt visuals, wait, re-measure, adapt again.
6. Add a manual scenario selector for demos: low valence/low arousal, low valence/high arousal, high valence/low arousal, high valence/high arousal.

### Data, Reports, and Research Completion

1. Persist session metrics locally with IndexedDB or SQLite/WASM.
2. Add session IDs, timestamps, browser/device metadata, and calibration metadata.
3. Create a real PDF report export with charts, summary, detected events, and caveats.
4. Add a scientific-report page or markdown report template.
5. Add user testing protocol: task, duration, consent note, measurements, post-session survey.
6. Add basic unit tests for metric formulas and integration tests for core routes.
7. Add accessibility and responsive QA, especially for camera screens and charts.

## Sources

Notion sources:

- [Amanda Yao](https://app.notion.com/p/08c7bbe0b80c82fc9a1a815c711a2e6f)
- [Syllabus + Kickstart](https://app.notion.com/p/fad7bbe0b80c83159ffb011ed2ffb772)
- [Week 1: Research Overview and Project Framework](https://app.notion.com/p/3407bbe0b80c82599a9e81c7519d8b37)
- [Week 5 Eye Gaze, AI & AI Platform](https://app.notion.com/p/d227bbe0b80c82cb9024017b9120bd5c)
- [Week 6 Project Rescope + Proposal](https://app.notion.com/p/0c17bbe0b80c82608a1e01e0783f667a)

Local code sources:

- `C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main\package.json`
- `C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main\src\context\AppContext.js`
- `C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main\src\components\CameraFeed.js`
- `C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main\src\components\DebugPanel.js`
- `C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main\src\components\DashboardCharts.js`
- `C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main\src\app\monitor\page.js`
- `C:\Users\fengf\Desktop\AI项目\AegisMind-AI-Study-Companion-main\src\app\dashboard\page.js`
