"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "../context/AppContext";
import CameraPermissionDialog from "./CameraPermissionDialog";
import { getAffectSession, predictAffectFromCanvas } from "../services/affect/browserAffectModel";

const FACE_CONTOUR = {
  leftEye: [33, 160, 158, 133, 153, 144, 33],
  rightEye: [362, 385, 387, 263, 373, 380, 362],
  leftBrow: [70, 63, 105, 66, 107],
  rightBrow: [336, 296, 334, 293, 300],
  oval: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
    361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
    176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109, 10,
  ],
  lowerLip: [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
    291, 308, 324, 318, 402, 317, 14, 87, 178, 95,
  ],
  upperLip: [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
    308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78,
  ],
  rightIris: [469, 470, 471, 472, 469],
  leftIris: [474, 475, 476, 477, 474],
};

const HAND_CONNECTIONS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
  [5, 9, 13, 17, 0],
];

const AFFECT_INPUT_SIZE = 224;
const AFFECT_INFERENCE_INTERVAL_MS = 1000;
const FACE_CROP_PADDING_RATIO = 0.15;

const getFaceBoundingBox = (landmarks, videoWidth, videoHeight) => {
  if (
    !Array.isArray(landmarks) ||
    landmarks.length === 0 ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return null;
  }

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxX = Math.max(maxX, landmark.x);
    maxY = Math.max(maxY, landmark.y);
  }

  let x = minX * videoWidth;
  let y = minY * videoHeight;
  let width = (maxX - minX) * videoWidth;
  let height = (maxY - minY) * videoHeight;

  const paddingX = width * FACE_CROP_PADDING_RATIO;
  const paddingY = height * FACE_CROP_PADDING_RATIO;

  x -= paddingX;
  y -= paddingY;
  width += paddingX * 2;
  height += paddingY * 2;

  const sideLength = Math.max(width, height);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  let squareX = centerX - sideLength / 2;
  let squareY = centerY - sideLength / 2;

  squareX = Math.max(0, squareX);
  squareY = Math.max(0, squareY);

  const boundedSideLength = Math.min(
    sideLength,
    videoWidth - squareX,
    videoHeight - squareY
  );

  if (boundedSideLength < 40) {
    return null;
  }

  return {
    x: squareX,
    y: squareY,
    size: boundedSideLength,
  };
};

export default function CameraFeed({ presentation = "monitor", showControls = true } = {}) {
  const {
    isMonitoring,
    toggleMonitoring,
    isCameraAllowed,
    stopCamera,
    setShowCameraDialog,
    isDebugMode,
    cameraStream,
    isAiLoaded,
    inferenceFps,
    faceLandmarkerRef,
    gestureRecognizerRef,
    updateAiMetrics,
    updateAffectMetrics,
    affectModelStatus,
    setAffectModelStatus,
  } = useAppState();

  const isFocusPanel = presentation === "focus-panel";

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [hasDetectedFace, setHasDetectedFace] = useState(false);
  const detectionsRef = useRef({ face: null, gesture: null });
  const aiLoadingStartRef = useRef(null);
  const inferenceAnimationRef = useRef(null);
  const faceCropCanvasRef = useRef(null);
  const lastAffectInferenceRef = useRef(0);
  const isAffectInferenceRunningRef = useRef(false);
  const affectRunTokenRef = useRef(0);
  const pipelineStateRef = useRef({
    isMonitoring: false,
    isCameraAllowed: false,
    isAiLoaded: false,
    isDebugMode: false,
    affectModelStatus: "idle",
  });

  useEffect(() => {
    pipelineStateRef.current = {
      isMonitoring,
      isCameraAllowed,
      isAiLoaded,
      isDebugMode,
      affectModelStatus,
    };
  }, [
    isMonitoring,
    isCameraAllowed,
    isAiLoaded,
    isDebugMode,
    affectModelStatus,
  ]);

  useEffect(() => {
    if (!isCameraAllowed) {
      setAffectModelStatus("idle");
      return;
    }

    let active = true;
    const loadAffectModel = async () => {
      setAffectModelStatus("loading");
      try {
        await getAffectSession();
        if (active) setAffectModelStatus("ready");
      } catch (error) {
        console.error("Failed to load affect model:", error);
        if (active) setAffectModelStatus("error");
      }
    };

    void loadAffectModel();

    return () => {
      active = false;
    };
  }, [isCameraAllowed, setAffectModelStatus]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraStream) return;

    video.srcObject = cameraStream;
    video.play().catch((error) => {
      if (error.name !== "AbortError") {
        console.error("Error playing video:", error);
      }
    });

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [cameraStream]);

  const handleDisableWebcam = () => {
    detectionsRef.current = { face: null, gesture: null };
    lastAffectInferenceRef.current = 0;
    affectRunTokenRef.current += 1;
    isAffectInferenceRunningRef.current = false;
    setHasDetectedFace(false);
    stopCamera();
  };

  useEffect(() => {
    if (isMonitoring && isCameraAllowed && !isAiLoaded) {
      if (!aiLoadingStartRef.current) {
        aiLoadingStartRef.current = performance.now();
      }
    } else {
      aiLoadingStartRef.current = null;
    }
  }, [isMonitoring, isCameraAllowed, isAiLoaded]);

  const runAffectAnalysis = useCallback(
    async (faceLandmarks) => {
      const video = videoRef.current;
      const cropCanvas = faceCropCanvasRef.current;
      const state = pipelineStateRef.current;

      if (!video || !cropCanvas) return;
      if (
        !state.isMonitoring ||
        !state.isCameraAllowed ||
        !state.isAiLoaded ||
        state.affectModelStatus !== "ready"
      ) {
        return;
      }
      if (
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return;
      }
      if (isAffectInferenceRunningRef.current) return;

      const boundingBox = getFaceBoundingBox(faceLandmarks, video.videoWidth, video.videoHeight);
      if (!boundingBox) return;
      const cropContext = cropCanvas.getContext("2d");
      if (!cropContext) return;

      cropCanvas.width = AFFECT_INPUT_SIZE;
      cropCanvas.height = AFFECT_INPUT_SIZE;

      cropContext.clearRect(0, 0, AFFECT_INPUT_SIZE, AFFECT_INPUT_SIZE);
      cropContext.drawImage(
        video,
        boundingBox.x,
        boundingBox.y,
        boundingBox.size,
        boundingBox.size,
        0,
        0,
        AFFECT_INPUT_SIZE,
        AFFECT_INPUT_SIZE
      );

      const requestToken = affectRunTokenRef.current + 1;
      affectRunTokenRef.current = requestToken;
      isAffectInferenceRunningRef.current = true;

      try {
        const inferenceStartedAt = performance.now();
        const result = await predictAffectFromCanvas(cropCanvas);
        const latencyMs = Math.round(performance.now() - inferenceStartedAt);
        const latestState = pipelineStateRef.current;

        if (
          requestToken !== affectRunTokenRef.current ||
          !latestState.isMonitoring ||
          !latestState.isCameraAllowed ||
          latestState.affectModelStatus !== "ready"
        ) {
          return;
        }

        updateAffectMetrics({ ...result, latencyMs });

        if (latestState.isDebugMode) {
          console.log("Affect inference result:", {
            mode: "browser",
            latencyMs,
            result,
          });
        }
      } catch (error) {
        const latestState = pipelineStateRef.current;
        if (
          requestToken === affectRunTokenRef.current &&
          latestState.isMonitoring &&
          latestState.isCameraAllowed
        ) {
          setAffectModelStatus("error");
          console.error("Failed to run affect analysis:", error);
        }
      } finally {
        if (requestToken === affectRunTokenRef.current) {
          isAffectInferenceRunningRef.current = false;
        }
      }
    },
    [updateAffectMetrics, setAffectModelStatus]
  );

  useEffect(() => {
    if (isMonitoring && isCameraAllowed) return;

    affectRunTokenRef.current += 1;
    isAffectInferenceRunningRef.current = false;
    const cropCanvas = faceCropCanvasRef.current;
    if (!cropCanvas) return;
    const cropContext = cropCanvas.getContext("2d");
    if (!cropContext) return;
    cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  }, [isMonitoring, isCameraAllowed]);

  useEffect(() => {
    if (!isMonitoring || !isCameraAllowed || !isAiLoaded || !videoRef.current) {
      detectionsRef.current = { face: null, gesture: null };
      setHasDetectedFace(false);
      return;
    }

    let active = true;
    let lastInferenceTime = 0;
    let inferenceRunning = false;

    const sampleAndRunInference = () => {
      if (!active) return;

      const video = videoRef.current;

      const videoReady =
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0;

      const modelsReady =
        Boolean(faceLandmarkerRef.current) && Boolean(gestureRecognizerRef.current);

      if (!videoReady || !modelsReady || inferenceRunning) {
        inferenceAnimationRef.current = requestAnimationFrame(sampleAndRunInference);
        return;
      }

      const now = performance.now();
      const targetInterval = 1000 / Math.max(inferenceFps || 5, 1);

      if (now - lastInferenceTime >= targetInterval) {
        lastInferenceTime = now;
        inferenceRunning = true;

        try {
          const startTime = performance.now();

          const faceResults = faceLandmarkerRef.current
            ? faceLandmarkerRef.current.detectForVideo(video, now)
            : null;

          setHasDetectedFace(faceResults?.faceLandmarks?.length > 0);

          const gestureResults = gestureRecognizerRef.current
            ? gestureRecognizerRef.current.recognizeForVideo(video, now)
            : null;

          const latencyTime = Math.round(performance.now() - startTime);

          detectionsRef.current = {
            face: faceResults,
            gesture: gestureResults,
          };

          updateAiMetrics(
            faceResults,
            gestureResults,
            latencyTime,
            {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
            }
          );

          const exactlyOneFace = faceResults?.faceLandmarks?.length === 1;
          const affectIntervalReached = now - lastAffectInferenceRef.current >= AFFECT_INFERENCE_INTERVAL_MS;
          const shouldRunAffectAnalysis =
            exactlyOneFace &&
            affectModelStatus === "ready" &&
            affectIntervalReached;

          if (shouldRunAffectAnalysis) {
            lastAffectInferenceRef.current = now;
            void runAffectAnalysis(faceResults.faceLandmarks[0]);
          }
        } catch (err) {
          console.error("Inference execution error:", err);
        } finally {
          inferenceRunning = false;
        }
      }

      inferenceAnimationRef.current = requestAnimationFrame(sampleAndRunInference);
    };

    inferenceAnimationRef.current = requestAnimationFrame(sampleAndRunInference);

    return () => {
      active = false;
      detectionsRef.current = { face: null, gesture: null };
      setHasDetectedFace(false);
      lastAffectInferenceRef.current = 0;
      affectRunTokenRef.current += 1;
      isAffectInferenceRunningRef.current = false;

      if (inferenceAnimationRef.current) {
        cancelAnimationFrame(inferenceAnimationRef.current);
        inferenceAnimationRef.current = null;
      }
    };
  }, [
    isMonitoring,
    isCameraAllowed,
    isAiLoaded,
    inferenceFps,
    faceLandmarkerRef,
    gestureRecognizerRef,
    updateAiMetrics,
    runAffectAnalysis,
    affectModelStatus,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width = 640;
    const height = canvas.height = 480;

    const drawStatusMessage = (title, subtitle, variant = "loading") => {
      const boxWidth = 440;
      const boxHeight = 76;
      const x = (width - boxWidth) / 2;
      const y = 24;

      ctx.save();
      ctx.fillStyle = variant === "warning" ? "rgba(127, 29, 29, 0.72)" : "rgba(15, 23, 42, 0.72)";
      ctx.strokeStyle = variant === "warning" ? "rgba(248, 113, 113, 0.75)" : "rgba(6, 182, 212, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.shadowColor = variant === "warning" ? "rgba(248, 113, 113, 0.35)" : "rgba(6, 182, 212, 0.35)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 14);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = variant === "warning" ? "rgba(254, 226, 226, 0.96)" : "rgba(207, 250, 254, 0.96)";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, width / 2, y + 30);
      ctx.fillStyle = "rgba(226, 232, 240, 0.82)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(subtitle, width / 2, y + 52);
      ctx.restore();
    };

    const drawFallbackFace = () => {
      ctx.save();
      ctx.strokeStyle = "rgba(6, 182, 212, 0.35)";
      ctx.fillStyle = "rgba(6, 182, 212, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(320, 245, 105, 140, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(270, 220);
      ctx.lineTo(300, 220);
      ctx.moveTo(340, 220);
      ctx.lineTo(370, 220);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(320, 225);
      ctx.lineTo(320, 275);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(290, 315);
      ctx.quadraticCurveTo(320, 325, 350, 315);
      ctx.stroke();

      const points = [
        [320, 105], [220, 245], [420, 245], [320, 385],
        [285, 220], [355, 220], [320, 275], [320, 320],
      ];

      points.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    };

    const drawMesh = () => {
      ctx.clearRect(0, 0, width, height);

      if (!isCameraAllowed || !isMonitoring) {
        ctx.shadowBlur = 0;
        return;
      }

      const detections = detectionsRef.current;
      const faceIsDetected = detections?.face?.faceLandmarks?.length > 0;

      if (faceIsDetected) {
        const landmarks = detections.face.faceLandmarks[0];
        ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
        ctx.fillStyle = "rgba(6, 182, 212, 0.7)";
        ctx.shadowColor = "rgba(6, 182, 212, 0.5)";
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.5;

        const project = (pt) => ({
          x: (1 - pt.x) * width,
          y: pt.y * height,
        });

        const drawContour = (indices, options = {}) => {
          const {
            strokeStyle = "rgba(6, 182, 212, 0.85)",
            lineWidth = 1.5,
            closePath = true,
          } = options;

          const validIndices = indices.filter((idx) => landmarks[idx]);
          if (validIndices.length < 2) return;

          ctx.beginPath();
          ctx.strokeStyle = strokeStyle;
          ctx.lineWidth = lineWidth;

          const start = project(landmarks[validIndices[0]]);
          ctx.moveTo(start.x, start.y);

          for (let i = 1; i < validIndices.length; i++) {
            const pt = project(landmarks[validIndices[i]]);
            ctx.lineTo(pt.x, pt.y);
          }

          if (closePath) ctx.closePath();
          ctx.stroke();
        };

        drawContour(FACE_CONTOUR.oval);
        drawContour(FACE_CONTOUR.leftEye);
        drawContour(FACE_CONTOUR.rightEye);
        drawContour(FACE_CONTOUR.leftBrow, { closePath: false });
        drawContour(FACE_CONTOUR.rightBrow, { closePath: false });
        drawContour(FACE_CONTOUR.lowerLip);
        drawContour(FACE_CONTOUR.upperLip);
        drawContour(FACE_CONTOUR.leftIris, { strokeStyle: "rgba(52, 211, 153, 0.95)" });
        drawContour(FACE_CONTOUR.rightIris, { strokeStyle: "rgba(52, 211, 153, 0.95)" });

        ctx.fillStyle = "rgba(6, 182, 212, 0.9)";
        landmarks.forEach((pt) => {
          const projected = project(pt);
          ctx.beginPath();
          ctx.arc(projected.x, projected.y, 0.8, 0, 2 * Math.PI);
          ctx.fill();
        });

        if (detections.gesture?.landmarks?.length > 0) {
          ctx.strokeStyle = "rgba(245, 158, 11, 0.85)";
          ctx.fillStyle = "rgba(245, 158, 11, 0.8)";
          ctx.shadowColor = "rgba(245, 158, 11, 0.5)";

          detections.gesture.landmarks.forEach((handLandmarks) => {
            HAND_CONNECTIONS.forEach((conn) => {
              ctx.beginPath();
              const start = project(handLandmarks[conn[0]]);
              ctx.moveTo(start.x, start.y);
              for (let i = 1; i < conn.length; i++) {
                const pt = project(handLandmarks[conn[i]]);
                ctx.lineTo(pt.x, pt.y);
              }
              ctx.stroke();
            });

            handLandmarks.forEach((pt) => {
              const projected = project(pt);
              ctx.beginPath();
              ctx.arc(projected.x, projected.y, 2.5, 0, 2 * Math.PI);
              ctx.fill();
            });
          });
        }

        ctx.shadowBlur = 0;
        animationRef.current = requestAnimationFrame(drawMesh);
        return;
      }

      if (isAiLoaded) {
        animationRef.current = requestAnimationFrame(drawMesh);
        return;
      }

      const now = performance.now();
      const elapsedMs = aiLoadingStartRef.current ? now - aiLoadingStartRef.current : 0;
      drawFallbackFace();

      if (elapsedMs > 8000) {
        drawStatusMessage(
          "AI model is taking longer than expected",
          "Check network, model path, browser console, or refresh the monitor page.",
          "warning"
        );
      } else {
        drawStatusMessage(
          "Loading MediaPipe AI models...",
          "Face and gesture tracking will appear once the model is ready.",
          "loading"
        );
      }

      ctx.shadowBlur = 0;
      animationRef.current = requestAnimationFrame(drawMesh);
    };

    drawMesh();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isMonitoring, isCameraAllowed, isAiLoaded]);

  const containerClass = isFocusPanel
    ? "relative flex h-full flex-col overflow-hidden rounded-xl border border-cyan-400/20 bg-slate-950 shadow-2xl"
    : "relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-2xl backdrop-blur-xl";

  const viewportClass = isFocusPanel
    ? "relative aspect-[4/3] w-full overflow-hidden bg-slate-950"
    : "relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/5 bg-slate-950 shadow-inner";

  const videoClass = isFocusPanel
    ? "absolute inset-0 h-full w-full object-cover opacity-0"
    : "absolute inset-0 h-full w-full object-cover opacity-70 transition-all duration-700";

  return (
    <div className={containerClass}>
      {!isFocusPanel && (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isMonitoring ? "animate-ping bg-cyan-400" : "bg-slate-500"}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${isMonitoring ? "bg-cyan-500" : "bg-slate-600"}`} />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {isMonitoring ? "Sensor Stream Active" : "Sensor Standby"}
            </span>
          </div>
        </div>
      )}

      <div className={viewportClass}>
        {isCameraAllowed && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={videoClass}
            style={{ transform: "scaleX(-1)" }}
          />
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 h-full w-full object-cover pointer-events-none"
        />

        <canvas
          ref={faceCropCanvasRef}
          width={AFFECT_INPUT_SIZE}
          height={AFFECT_INPUT_SIZE}
          className={
            isDebugMode && !isFocusPanel
              ? "absolute bottom-2 right-2 z-30 h-28 w-28 -scale-x-100 border border-red-400 bg-black"
              : "hidden"
          }
          aria-label={isDebugMode && !isFocusPanel ? "Affect model face crop preview" : undefined}
          aria-hidden={!isDebugMode || isFocusPanel}
        />

        {isDebugMode && !isFocusPanel && (
          <span className="absolute bottom-[7.5rem] right-2 z-30 rounded bg-red-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300 pointer-events-none">
            Affect Crop Debug
          </span>
        )}

        {isMonitoring && isCameraAllowed && isAiLoaded && !hasDetectedFace && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <p className="text-sm font-semibold tracking-wide text-slate-200">
              No Face Detected
            </p>
          </div>
        )}

        {!isFocusPanel && (!isCameraAllowed || !isMonitoring) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center">
            {!isCameraAllowed ? (
              <>
                <div className="mb-3 rounded-full border border-white/5 bg-slate-900 p-4">
                  <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Camera Stream Offline</h3>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  AegisMind requires camera access to analyze facial postures and gestures.
                </p>
                <button
                  onClick={() => setShowCameraDialog(true)}
                  className="mt-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-blue-400"
                >
                  Enable Camera
                </button>
              </>
            ) : (
              <>
                <div className="mb-3 rounded-full border border-cyan-500/10 bg-cyan-950/40 p-4">
                  <svg className="h-8 w-8 text-cyan-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Monitoring Paused</h3>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  The camera feed is active, but mental state analysis is currently paused.
                </p>
                <button
                  onClick={toggleMonitoring}
                  className="mt-4 rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-slate-800"
                >
                  Resume Study Session
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {showControls && !isFocusPanel && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={toggleMonitoring}
            disabled={!isCameraAllowed}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-300 ${
              !isCameraAllowed
                ? "bg-slate-900 border border-white/5 text-slate-600 cursor-not-allowed"
                : isMonitoring
                  ? "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                  : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/10 hover:from-cyan-400 hover:to-blue-400"
            }`}
          >
            {isMonitoring ? "Pause Session" : "Start Session"}
          </button>

          <button
            onClick={handleDisableWebcam}
            disabled={!isCameraAllowed}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold border transition-all duration-300 ${
              !isCameraAllowed
                ? "border-white/5 text-slate-600 cursor-not-allowed bg-slate-900/40"
                : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
            }`}
            title="Disable Webcam"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
            </svg>
            <span className="hidden sm:inline">Disable Webcam</span>
          </button>
        </div>
      )}

      {!isFocusPanel && <CameraPermissionDialog />}
    </div>
  );
}