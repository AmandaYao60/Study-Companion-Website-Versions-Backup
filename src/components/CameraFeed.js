"use client";

import React, { useEffect, useRef } from "react";
import { useDebug, useMonitoring, useSession } from "../context/AppContext";
import CameraPermissionDialog from "./CameraPermissionDialog";

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

const formatStatusValue = (value) => {
  if (!value) return "Idle";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export default function CameraFeed({ presentation = "monitor", showControls = true } = {}) {
  const {
    isMonitoring,
    toggleMonitoring,
    isCameraAllowed,
    stopCamera,
    setShowCameraDialog,
    cameraStream,
    isAiLoaded,
    affectModelStatus,
    hasDetectedFace,
    monitoringDetectionsRef,
    runtimeFaceCropCanvasRef,
  } = useMonitoring();
  const {
    isDebugMode,
    isSensitiveDebugPreviewEnabled,
  } = useDebug();
  const {
    activeSession,
    timedBreak,
  } = useSession();

  const isFocusPanel = presentation === "focus-panel";
  const hasSession = Boolean(activeSession);
  const sessionStatus = activeSession?.status;
  const isPreparedSession = sessionStatus === "prepared";
  const isActiveWithoutMonitoring = sessionStatus === "active" && !isMonitoring;
  const isPausedSession = sessionStatus === "paused" || (hasSession && !isMonitoring);
  const isBreakMode = timedBreak?.isBreakMode === true;

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const debugCropCanvasRef = useRef(null);
  const animationRef = useRef(null);
  const cropAnimationRef = useRef(null);
  const aiLoadingStartRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraStream) return undefined;

    video.srcObject = cameraStream;
    video.play().catch((error) => {
      if (error.name !== "AbortError") {
        console.error("Error playing visible video:", error);
      }
    });

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [cameraStream]);

  useEffect(() => {
    if (isMonitoring && isCameraAllowed && !isAiLoaded) {
      if (!aiLoadingStartRef.current) {
        aiLoadingStartRef.current = performance.now();
      }
    } else {
      aiLoadingStartRef.current = null;
    }
  }, [isMonitoring, isCameraAllowed, isAiLoaded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
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

      [
        [320, 105], [220, 245], [420, 245], [320, 385],
        [285, 220], [355, 220], [320, 275], [320, 320],
      ].forEach(([x, y]) => {
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
        animationRef.current = requestAnimationFrame(drawMesh);
        return;
      }

      const detections = monitoringDetectionsRef.current;
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

          for (let i = 1; i < validIndices.length; i += 1) {
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
              for (let i = 1; i < conn.length; i += 1) {
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
  }, [isMonitoring, isCameraAllowed, isAiLoaded, monitoringDetectionsRef]);

  useEffect(() => {
    const shouldCopyCrop = isDebugMode && isSensitiveDebugPreviewEnabled && !isFocusPanel;
    const targetCanvas = debugCropCanvasRef.current;
    if (!targetCanvas) return undefined;

    if (!shouldCopyCrop) {
      const clearContext = targetCanvas.getContext("2d");
      clearContext?.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      return undefined;
    }

    const targetContext = targetCanvas.getContext("2d");
    if (!targetContext) return undefined;

    const copyCrop = () => {
      const sourceCanvas = runtimeFaceCropCanvasRef.current;
      if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
        targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        targetContext.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
      }
      cropAnimationRef.current = requestAnimationFrame(copyCrop);
    };

    copyCrop();

    return () => {
      if (cropAnimationRef.current) {
        cancelAnimationFrame(cropAnimationRef.current);
        cropAnimationRef.current = null;
      }
    };
  }, [isDebugMode, isFocusPanel, isSensitiveDebugPreviewEnabled, runtimeFaceCropCanvasRef]);

  const handleDisableWebcam = () => {
    stopCamera();
  };

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-white">Camera Preview</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isMonitoring ? "animate-ping bg-cyan-400" : "bg-slate-500"}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${isMonitoring ? "bg-cyan-500" : "bg-slate-600"}`} />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {isMonitoring ? "Sensor Stream Active" : "Sensor Standby"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className={`rounded-full border px-2 py-1 ${isCameraAllowed ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-slate-900 text-slate-400"}`}>
              Camera {isCameraAllowed ? "Enabled" : "Offline"}
            </span>
            <span className={`rounded-full border px-2 py-1 ${isAiLoaded ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
              MediaPipe {isAiLoaded ? "Ready" : "Loading"}
            </span>
            <span className="rounded-full border border-white/10 bg-slate-900 px-2 py-1 text-slate-300">
              ONNX {formatStatusValue(affectModelStatus)}
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
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-cover"
        />

        <canvas
          ref={debugCropCanvasRef}
          width={AFFECT_INPUT_SIZE}
          height={AFFECT_INPUT_SIZE}
          className={
            isDebugMode && isSensitiveDebugPreviewEnabled && !isFocusPanel
              ? "absolute bottom-2 right-2 z-30 h-28 w-28 -scale-x-100 border border-red-400 bg-black"
              : "hidden"
          }
          aria-label={isDebugMode && isSensitiveDebugPreviewEnabled && !isFocusPanel ? "Affect model face crop preview" : undefined}
          aria-hidden={!isDebugMode || !isSensitiveDebugPreviewEnabled || isFocusPanel}
        />

        {isDebugMode && isSensitiveDebugPreviewEnabled && !isFocusPanel && (
          <span className="pointer-events-none absolute bottom-[7.5rem] right-2 z-30 rounded bg-red-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300">
            Affect Crop Debug
          </span>
        )}

        {isMonitoring && isCameraAllowed && isAiLoaded && !hasDetectedFace && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <p className="text-sm font-semibold tracking-wide text-slate-200">
              No Face Detected
            </p>
          </div>
        )}

        {(!isCameraAllowed || !isMonitoring) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center">
            {isBreakMode ? (
              <>
                <div className="mb-3 rounded-full border border-emerald-400/10 bg-emerald-400/10 p-4">
                  <svg className="h-8 w-8 text-emerald-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a8.97 8.97 0 008.354-5.646z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Enjoy your break time</h3>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Camera and monitoring are stopped until you continue studying.
                </p>
              </>
            ) : !hasSession ? (
              <>
                <div className="mb-3 rounded-full border border-white/5 bg-slate-900 p-4">
                  <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Monitoring Not Started</h3>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Start a study session to enable monitoring.
                </p>
              </>
            ) : !isCameraAllowed ? (
              <>
                <div className="mb-3 rounded-full border border-white/5 bg-slate-900 p-4">
                  <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-300">{isPreparedSession ? "Waiting for camera permission" : "Camera Stream Offline"}</h3>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  {isPreparedSession ? "Camera access is required to begin monitoring." : "Enable the camera to continue this study session."}
                </p>
              </>
            ) : isPausedSession ? (
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
              </>
            ) : null}
          </div>
        )}

        {!isFocusPanel && hasSession && !isBreakMode && (
          <button
            type="button"
            onClick={isCameraAllowed ? handleDisableWebcam : () => setShowCameraDialog(true)}
            className={`absolute bottom-3 right-3 z-40 rounded-lg px-4 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
              isCameraAllowed
                ? "border border-red-500/30 bg-slate-950/80 text-red-300 shadow-red-950/30 hover:bg-red-500/20"
                : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-400"
            }`}
          >
            {isCameraAllowed ? "Disable Webcam" : "Enable Camera"}
          </button>
        )}
      </div>

      {showControls && !isFocusPanel && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={toggleMonitoring}
            disabled={!isCameraAllowed}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-300 ${
              !isCameraAllowed
                ? "cursor-not-allowed border border-white/5 bg-slate-900 text-slate-600"
                : isMonitoring
                  ? "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/10 hover:from-cyan-400 hover:to-blue-400"
            }`}
          >
            {isMonitoring ? "Pause Session" : isPreparedSession ? "Enable Camera" : isActiveWithoutMonitoring ? "Enable Monitoring" : "Resume Session"}
          </button>
        </div>
      )}

      {!isFocusPanel && <CameraPermissionDialog />}
    </div>
  );
}
