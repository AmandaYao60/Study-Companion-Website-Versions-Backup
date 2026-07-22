"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { useAppState } from "../../context/AppContext";
import { getAffectSession, predictAffectFromCanvas } from "../../services/affect/browserAffectModel";

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

export default function MonitoringRuntimeHost() {
  const {
    isMonitoring,
    isCameraAllowed,
    cameraStream,
    isAiLoaded,
    inferenceFps,
    isDebugMode,
    faceLandmarkerRef,
    gestureRecognizerRef,
    updateAiMetrics,
    updateAffectMetrics,
    affectModelStatus,
    setAffectModelStatus,
    setHasDetectedFace,
    setRuntimeStatus,
    monitoringDetectionsRef,
    runtimeFaceCropCanvasRef,
  } = useAppState();

  const videoRef = useRef(null);
  const inferenceAnimationRef = useRef(null);
  const lastAffectInferenceRef = useRef(0);
  const isAffectInferenceRunningRef = useRef(false);
  const affectRunTokenRef = useRef(0);
  const runtimeGenerationRef = useRef(0);
  const stateRef = useRef({
    isMonitoring: false,
    isCameraAllowed: false,
    isAiLoaded: false,
    isDebugMode: false,
    affectModelStatus: "idle",
  });

  useEffect(() => {
    stateRef.current = {
      isMonitoring,
      isCameraAllowed,
      isAiLoaded,
      isDebugMode,
      affectModelStatus,
    };
  }, [isMonitoring, isCameraAllowed, isAiLoaded, isDebugMode, affectModelStatus]);

  useEffect(() => {
    if (!isCameraAllowed) {
      setAffectModelStatus("idle");
      return undefined;
    }

    let active = true;
    setAffectModelStatus("loading");

    getAffectSession()
      .then(() => {
        if (active) setAffectModelStatus("ready");
      })
      .catch((error) => {
        console.error("Failed to load affect model:", error);
        if (active) setAffectModelStatus("error");
      });

    return () => {
      active = false;
    };
  }, [isCameraAllowed, setAffectModelStatus]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraStream) return undefined;

    video.srcObject = cameraStream;
    video.play().catch((error) => {
      if (error.name !== "AbortError") {
        console.error("Error playing runtime video:", error);
      }
    });

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [cameraStream]);

  const clearRuntimeOutputs = useCallback(() => {
    monitoringDetectionsRef.current = { face: null, gesture: null };
    setHasDetectedFace(false);
    lastAffectInferenceRef.current = 0;
    affectRunTokenRef.current += 1;
    isAffectInferenceRunningRef.current = false;

    const cropCanvas = runtimeFaceCropCanvasRef.current;
    const cropContext = cropCanvas?.getContext("2d");
    if (cropCanvas && cropContext) {
      cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    }
  }, [monitoringDetectionsRef, runtimeFaceCropCanvasRef, setHasDetectedFace]);

  const runAffectAnalysis = useCallback(async (faceLandmarks, generation) => {
    const video = videoRef.current;
    const cropCanvas = runtimeFaceCropCanvasRef.current;
    const state = stateRef.current;

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
      const latestState = stateRef.current;

      if (
        requestToken !== affectRunTokenRef.current ||
        generation !== runtimeGenerationRef.current ||
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
      const latestState = stateRef.current;
      if (
        requestToken === affectRunTokenRef.current &&
        generation === runtimeGenerationRef.current &&
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
  }, [runtimeFaceCropCanvasRef, setAffectModelStatus, updateAffectMetrics]);

  useEffect(() => {
    if (!isMonitoring || !isCameraAllowed || !isAiLoaded || !videoRef.current) {
      clearRuntimeOutputs();
      setRuntimeStatus(isCameraAllowed ? "idle" : "camera-off");
      return undefined;
    }

    let active = true;
    let lastInferenceTime = 0;
    let inferenceRunning = false;
    const generation = runtimeGenerationRef.current + 1;
    runtimeGenerationRef.current = generation;
    setRuntimeStatus("running");

    const sampleAndRunInference = () => {
      if (!active || generation !== runtimeGenerationRef.current) return;

      const video = videoRef.current;
      const videoReady =
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0;
      const modelsReady = Boolean(faceLandmarkerRef.current) && Boolean(gestureRecognizerRef.current);

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
          const gestureResults = gestureRecognizerRef.current
            ? gestureRecognizerRef.current.recognizeForVideo(video, now)
            : null;
          const latencyTime = Math.round(performance.now() - startTime);
          const faceDetected = faceResults?.faceLandmarks?.length > 0;

          monitoringDetectionsRef.current = {
            face: faceResults,
            gesture: gestureResults,
          };
          setHasDetectedFace(faceDetected);
          updateAiMetrics(faceResults, gestureResults, latencyTime, {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
          });

          const exactlyOneFace = faceResults?.faceLandmarks?.length === 1;
          const affectIntervalReached = now - lastAffectInferenceRef.current >= AFFECT_INFERENCE_INTERVAL_MS;
          if (exactlyOneFace && stateRef.current.affectModelStatus === "ready" && affectIntervalReached) {
            lastAffectInferenceRef.current = now;
            void runAffectAnalysis(faceResults.faceLandmarks[0], generation);
          }
        } catch (error) {
          console.error("Inference execution error:", error);
        } finally {
          inferenceRunning = false;
        }
      }

      inferenceAnimationRef.current = requestAnimationFrame(sampleAndRunInference);
    };

    inferenceAnimationRef.current = requestAnimationFrame(sampleAndRunInference);

    return () => {
      active = false;
      runtimeGenerationRef.current += 1;
      clearRuntimeOutputs();
      setRuntimeStatus("idle");
      if (inferenceAnimationRef.current) {
        cancelAnimationFrame(inferenceAnimationRef.current);
        inferenceAnimationRef.current = null;
      }
    };
  }, [
    clearRuntimeOutputs,
    faceLandmarkerRef,
    gestureRecognizerRef,
    inferenceFps,
    isAiLoaded,
    isCameraAllowed,
    isMonitoring,
    monitoringDetectionsRef,
    runAffectAnalysis,
    setHasDetectedFace,
    setRuntimeStatus,
    updateAiMetrics,
  ]);

  return (
    <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
      <video ref={videoRef} autoPlay muted playsInline />
      <canvas ref={runtimeFaceCropCanvasRef} width={AFFECT_INPUT_SIZE} height={AFFECT_INPUT_SIZE} />
    </div>
  );
}
