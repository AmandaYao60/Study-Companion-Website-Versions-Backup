# AI Pipeline

This document describes the current AI and telemetry pipeline as implemented in `src/context/AppContext.js`, `src/components/monitoring/MonitoringRuntimeHost.js`, and `src/components/CameraFeed.js`.

## Model Loading

`AppContext.js` loads MediaPipe models on the client through `loadAiModels()`:

1. Dynamically imports `FilesetResolver`, `FaceLandmarker`, and `GestureRecognizer` from `@mediapipe/tasks-vision`.
2. Creates a vision task resolver from the jsDelivr WASM path:
   `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`
3. Creates a `FaceLandmarker`.
4. Creates a `GestureRecognizer`.
5. Updates loading progress and logs model-load events.

The loader is guarded by `isAiLoaded` and `isAiInitializingRef` to avoid duplicate initialization.

## FaceLandmarker Configuration

The current face model configuration:

- Model asset path: Google-hosted `face_landmarker.task`.
- Delegate: `GPU`.
- `outputFaceBlendshapes: true`.
- `outputFacialTransformationMatrixes: true`.
- `runningMode: "VIDEO"`.

Face blendshapes drive eye openness and blink logic. Facial transformation matrices are used for yaw, pitch, and roll extraction.

## GestureRecognizer Configuration

The current gesture model configuration:

- Model asset path: Google-hosted `gesture_recognizer.task`.
- Delegate: `GPU`.
- `runningMode: "VIDEO"`.
- `numHands: 2`.

The app can preserve and render landmarks from two detected hands. It also stores hand landmarks with separate `handId` values.

## Video Readiness Checks

`MonitoringRuntimeHost.js` mounts once under the `/app` product layout and runs the shared MediaPipe and ONNX inference pipeline for Study Space, Focus Space, Dashboard, Settings, and Account routes. It runs inference only when:

- Monitoring is active.
- Camera is enabled.
- AI models are loaded.
- `videoRef.current` exists.
- The video is ready at least to `HTMLMediaElement.HAVE_CURRENT_DATA`.
- `video.videoWidth > 0`.
- `video.videoHeight > 0`.
- At least one model ref exists.

If these checks fail, the inference loop schedules the next animation frame and waits.

## Inference Throttling and Overlap Prevention

Inference is driven by `requestAnimationFrame`, but actual model calls are throttled by `inferenceFps`.

```text
targetInterval = 1000 / Math.max(inferenceFps || 5, 1)
```

`inferenceRunning` prevents overlapping inference calls. This matters because model calls may take longer than a frame on slower devices.

## Face Detection State

After `detectForVideo()`, `MonitoringRuntimeHost.js` updates shared runtime state:

```text
hasDetectedFace = faceResults?.faceLandmarks?.length > 0
```

When monitoring is active, camera is enabled, AI is loaded, and `hasDetectedFace` is false, React renders `No Face Detected`. In this state, the canvas does not draw fallback landmarks.

## Face Landmark Rendering

When face landmarks exist, `CameraFeed.js` reads the latest shared runtime detections and renders a landmark canvas. The Monitor presentation also shows real camera pixels; the Focus panel presentation visually hides the preview pixels while rendering landmarks. Inference is preserved by the persistent runtime host rather than by route-specific hidden CameraFeed instances.

- Face oval contour.
- Left and right eye contours.
- Left and right brow contours.
- Lower and upper lip contours.
- Left and right iris contours.
- All face landmark dots.

Landmarks are projected from normalized MediaPipe coordinates into the 640 by 480 canvas coordinate space.

## Two-Hand Landmark Handling

`MonitoringRuntimeHost.js` stores every hand landmark set returned by MediaPipe in shared runtime detections. `CameraFeed.js` reads those detections and draws each hand skeleton with shared `handConnections`.

`AppContext.js` stores every hand point as:

```text
{
  handId,
  id,
  x,
  y,
  z
}
```

This allows the CSV export to distinguish `hand_0`, `hand_1`, and so on.

## Gesture Processing

For each detected hand, `AppContext.js` takes the top gesture candidate when present. It filters out gestures with score at or below `0.45` and gestures named `None`.

The highest-confidence gesture becomes the primary `currentGesture`. Metric effects are applied by unique gesture name so duplicate gesture effects are not applied twice for the same frame.

Current gesture effects:

- `Closed_Fist`: logs the detected gesture.
- `Thumb_Up`: logs positive reinforcement.
- Sustained two-hand activity for 10 frames logs a warning and can reduce attention slightly.

Two visible hands are treated only as a weak possible distraction signal. This is a product heuristic, not a scientific conclusion.

## Blink Detection

Blink detection uses face blendshape scores:

- `eyeBlinkLeft`
- `eyeBlinkRight`

Eye openness is calculated as:

```text
1 - (blinkLeft + blinkRight) / 2
```

Current thresholds:

- Eyes closed: `eyeOpenness < 0.22`.
- Blink duration: 80 ms to 450 ms.
- Long closure warning: greater than 1200 ms.

Blink timestamps are stored for a rolling one-minute blink rate.

## Head-Pose Extraction

Head pose is extracted from the first facial transformation matrix. The code derives yaw, pitch, and roll from matrix values using `Math.atan2()` and converts radians to degrees.

These values are used as observed CV signals. Looking-away heuristics then compare yaw and pitch with thresholds.

## Telemetry Storage and Export

For processed frames while Debug Mode is active, `AppContext.js` can store a bounded telemetry table row with:

- Time.
- Eye openness.
- Blink and long-closure state.
- Yaw and pitch.
- Gesture.
- Hand count.

Raw face and hand landmarks are captured only when Debug Mode is active and the collapsed sensitive preview/capture path has been explicitly enabled. The telemetry and raw-landmark histories are memory-only and keep approximately the latest 50 records. They are cleared when Debug Mode closes, sensitive capture is disabled, or reset paths run. `exportTelemetryCSV()` serializes captured raw landmarks into a CSV with columns:

```text
Timestamp,Source,Point_ID,X,Y,Z
```

CSV files are downloaded in the browser through a Blob and object URL.

## Attention, Fatigue, and Affect Metrics

The app currently combines observed CV signals and simple heuristics:

- Low eye openness can raise fatigue and reduce attention.
- Long eye closure can raise fatigue and reduce attention.
- Looking away by yaw or pitch thresholds can reduce attention.
- Looking toward the screen can increase attention slightly.
- Sustained two-hand activity can reduce attention.
- EmotiEffLib provides valence and affect arousal in the browser-local ONNX path.
- Debug simulation controls can preview display metrics but do not set authoritative estimators or formal samples.

These metrics are useful for product prototyping and visualization, but they are not validated psychological measurements.

## Observed Signals Versus Interpretations

Observed CV signals:

- Face landmarks.
- Face blendshape scores.
- Facial transformation matrices.
- Hand landmarks.
- Gesture recognizer categories and confidence scores.
- Frame latency.

Heuristic interpretations:

- Eye openness as fatigue evidence.
- Head-pose deviation as looking away.
- Sustained two-hand activity as possible distraction.
- Certain gestures as positive or attention-related signals.

Memory-only Debug Simulation data:

- Normalized display-preview values for attention, fatigue, valence, affect arousal, top expression, face state, and data quality.
- Presets for UI development. These values do not enter formal samples, statistics, persistence, checkpoints, inference, or completed history.

Unsupported conclusions:

- Clinical stress diagnosis.
- Medical fatigue diagnosis.
- Reliable emotional state classification.
- Reliable attention diagnosis across users, lighting conditions, cameras, or cultures.

## Focus Space Shell

The `/focus` route is a Phase 2 shell. It contains a lightweight visual-stage placeholder and a draggable floating monitor panel. The final adaptive particle environment and task system are not implemented yet. The panel reuses `CameraFeed` with `presentation="focus-panel"` for presentation only; it does not create a second inference pipeline.

## Scientific and Product Limitations

- No calibration wizard exists yet.
- No validated user baseline is stored.
- Stress and arousal are not yet grounded in physiological measurement.
- Current gesture categories may not correspond to study posture semantics.
- Browser-local EmotiEffLib ONNX affect inference is present, but the displayed study metrics remain heuristic and product-level.
- There is no confidence-aware mental-state model.
- Telemetry is volatile unless exported manually.
