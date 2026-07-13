# Project Status

## Current Feature

CameraFeed webcam, MediaPipe face tracking, gesture tracking, and Privacy Shield logic have been refactored.

## Completed Changes

### Camera lifecycle

- Added a Disable Webcam button.
- Webcam shutdown now pauses the video element, clears its `srcObject`, stops the media stream, clears cached detections, and disables Privacy Shield.
- Canvas rendering stops when the webcam is disabled.

### Monitoring lifecycle

- Canvas rendering stops when monitoring is paused.
- Paused monitoring uses the React standby overlay instead of simulated landmarks.
- No fallback landmarks are displayed when monitoring is inactive.

### Face detection states

- Added `hasDetectedFace` React state.
- `hasDetectedFace` is updated from:
  `faceResults?.faceLandmarks?.length > 0`
- When the AI model is loaded but no face is detected:
  - canvas remains empty
  - JSX displays `No Face Detected`
- This behavior applies in both normal mode and Privacy Shield mode.

### Privacy Shield

- Removed the centered Privacy Shield message.
- Privacy Shield now uses only a dark blue background layer.
- The canvas remains above the privacy background.
- Real face landmarks remain visible in Privacy Shield mode.
- The tracking bounding box is calculated from real MediaPipe landmarks.
- Removed the simulated tracking box and simulated `FACE_TRACK_ACTIVE` label.

### AI loading fallback

- Removed the complex simulated `baseLandmarks` animation.
- Removed simulated:
  - blinking
  - yawning
  - head-pose movement
  - micro-jitter
  - fake mesh connections
- Added a lightweight static `drawFallbackFace()` placeholder.
- Added loading and delayed-warning messages.
- After 8 seconds, the UI displays troubleshooting guidance.

### MediaPipe inference

- Inference runs only when:
  - monitoring is active
  - camera is enabled
  - AI models are loaded
  - video data is ready
- Inference is throttled using `inferenceFps`.
- `inferenceRunning` prevents overlapping inference calls.
- Detection refs and face state are reset during cleanup.

### Hand tracking

- Gesture Recognizer is configured with:
  `numHands: 2`
- CameraFeed iterates through every returned hand landmark set.
- Both hand skeletons can be rendered.
- AppContext stores landmarks with a `handId`.
- AppContext processes the top gesture from each detected hand.
- A highest-confidence gesture is selected as the primary gesture.
- Duplicate gesture effects are prevented using unique gesture names.
- Sustained two-hand activity is treated as a possible distraction signal.

## Current CameraFeed State Flow

1. Camera disabled:
   - Camera Offline overlay
   - empty canvas

2. Camera enabled, monitoring paused:
   - Monitoring Paused overlay
   - empty canvas

3. Monitoring active, AI not loaded:
   - static fallback face
   - loading or warning message

4. Monitoring active, AI loaded, no face:
   - empty canvas
   - `No Face Detected`

5. Monitoring active, face detected:
   - real face mesh
   - detected hand skeletons
   - optional Privacy Shield bounding box

## Important Files

- `src/components/CameraFeed.js`
- `src/context/AppContext.js`

## Remaining Considerations

- Consider moving `faceContours` and `handConnections` to module-level constants outside the React component.
- Consider separating face drawing and hand drawing into helper functions.
- Review whether sustained two-hand activity should always reduce focus.
- Consider applying time-based cooldowns to gesture logs and metric changes.
- Verify whether hands should still be drawn when no face is detected.