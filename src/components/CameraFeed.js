"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppState } from "../context/AppContext";
  const faceContours = {
    leftEye: [33, 160, 158, 133, 153, 144, 33],
    rightEye: [362, 385, 387, 263, 373, 380, 362],

    leftBrow: [70, 63, 105, 66, 107],
    rightBrow: [336, 296, 334, 293, 300],

    oval: [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
      361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
      176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
      162, 21, 54, 103, 67, 109, 10
    ],

    lowerLip: [
      61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
      291, 308, 324, 318, 402, 317, 14, 87, 178, 95
    ],
    upperLip: [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
    308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78
    ],

    rightIris: [469, 470, 471, 472, 469],
    leftIris: [474, 475, 476, 477, 474]
  };
  const handConnections = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20], 
    [5, 9, 13, 17, 0]
  ];

export default function CameraFeed() {
  const {
    isMonitoring,
    toggleMonitoring,
    isCameraAllowed,
    startCamera,
    stopCamera,
    showCameraDialog,
    setShowCameraDialog,
    isPrivacyMode,
    setIsPrivacyMode,
    cameraStream,
    
    // AI SDK additions
    isAiLoaded,
    inferenceFps,
    faceLandmarkerRef,
    gestureRecognizerRef,
    updateAiMetrics
  } = useAppState();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasDetectedFace, setHasDetectedFace] = useState(false);
  const detectionsRef = useRef({ face: null, gesture: null });
  const aiLoadingStartRef = useRef(null);
  const inferenceAnimationRef = useRef(null);


  // Handle stream binding to video element
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(err => console.error("Error playing video:", err));
    }
  }, [cameraStream]);

  // Handle camera activation when allowed
  const handleRequestAccess = async () => {
    setIsInitializing(true);
    setErrorMsg("");
    try {
      await startCamera();
      setShowCameraDialog(false);
    } catch (err) {
      setErrorMsg("Could not access camera. Please ensure permissions are granted and no other app is using it.");
    } finally {
      setIsInitializing(false);
    }
  };

  // Handle camera deactivation and cleanup
  const handleDisableWebcam = () => {
    detectionsRef.current = { face: null, gesture: null };

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    stopCamera();

    setErrorMsg("");
    setIsPrivacyMode(false);
  };
  
  //If camera and monitoring are active but AI is not loaded, start AI loading timer
  useEffect(() => {
    if (isMonitoring && isCameraAllowed && !isAiLoaded) {
      if (!aiLoadingStartRef.current) {
        aiLoadingStartRef.current = performance.now();
      }
    } else {
      aiLoadingStartRef.current = null;
    }
  }, [isMonitoring, isCameraAllowed, isAiLoaded]);

  // Real MediaPipe Inference and Frame Sampler Loop
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
        faceLandmarkerRef?.current || gestureRecognizerRef?.current;

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

          setHasDetectedFace(
            faceResults?.faceLandmarks?.length > 0
          );

          const gestureResults = gestureRecognizerRef.current
            ? gestureRecognizerRef.current.recognizeForVideo(video, now)
            : null;

          const latencyTime = Math.round(performance.now() - startTime);

          detectionsRef.current = {
            face: faceResults,
            gesture: gestureResults,
          };

          updateAiMetrics(faceResults, gestureResults, latencyTime);
        } 
        catch (err) {
          console.error("Inference execution error:", err);
        } 
        finally {
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
  ]);

  // Canvas Drawing Loop for Face and Gesture Meshes
  useEffect(() => {
    //Set up the canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = canvas.width = 640;
    let height = canvas.height = 480;
    

    // Function to draw status messages on the canvas when the AI model is loading or if there are errors
    const drawStatusMessage = (title, subtitle, variant = "loading") => {
      const boxWidth = 440;
      const boxHeight = 76;
      const x = (width - boxWidth) / 2;
      const y = 24;

      ctx.save();

      // background
      ctx.fillStyle =
        variant === "warning"
          ? "rgba(127, 29, 29, 0.72)"
          : "rgba(15, 23, 42, 0.72)";

      ctx.strokeStyle =
        variant === "warning"
          ? "rgba(248, 113, 113, 0.75)"
          : "rgba(6, 182, 212, 0.7)";

      ctx.lineWidth = 1.2;
      ctx.shadowColor =
        variant === "warning"
          ? "rgba(248, 113, 113, 0.35)"
          : "rgba(6, 182, 212, 0.35)";
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 14);
      ctx.fill();
      ctx.stroke();

      // title
      ctx.shadowBlur = 0;
      ctx.fillStyle =
        variant === "warning"
          ? "rgba(254, 226, 226, 0.96)"
          : "rgba(207, 250, 254, 0.96)";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, width / 2, y + 30);

      // subtitle
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

      // Face outline
      ctx.beginPath();
      ctx.ellipse(320, 245, 105, 140, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Eyes
      ctx.beginPath();
      ctx.moveTo(270, 220);
      ctx.lineTo(300, 220);
      ctx.moveTo(340, 220);
      ctx.lineTo(370, 220);
      ctx.stroke();

      // Nose
      ctx.beginPath();
      ctx.moveTo(320, 225);
      ctx.lineTo(320, 275);
      ctx.stroke();

      // Mouth
      ctx.beginPath();
      ctx.moveTo(290, 315);
      ctx.quadraticCurveTo(320, 325, 350, 315);
      ctx.stroke();

      // A few landmark dots
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
      
      // If the camera or the monitoring state isgi disabled, keep the canvas completely empty and stop this animation loop
      if (!isCameraAllowed || !isMonitoring) {
        ctx.shadowBlur = 0;
        return;
      }
      
      const detections = detectionsRef.current;
      const faceIsDetected = detections?.face?.faceLandmarks?.length > 0;
        
      // If we have actual face landmarks from MediaPipe, draw them
      if (faceIsDetected) {
        const landmarks = detections.face.faceLandmarks[0];

        // Active neon styles
        ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
        ctx.fillStyle = "rgba(6, 182, 212, 0.7)";
        ctx.shadowColor = "rgba(6, 182, 212, 0.5)";
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.5;

        // Define a function to project the normalized landmarks of MediaPipe to canvas pixel coordinates
        const project = (pt) => ({
          x: pt.x * width,
          y: pt.y * height
        });

        // 1. Draw facial contours
        const drawContour = (indices, options = {}) => {
          const {
            strokeStyle = "rgba(6, 182, 212, 0.85)",
            lineWidth = 1.5,
            closePath = true
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

        // Face outline and main features
        drawContour(faceContours.oval);

        drawContour(faceContours.leftEye);
        drawContour(faceContours.rightEye);

        drawContour(faceContours.leftBrow, {closePath: false});
        drawContour(faceContours.rightBrow, {closePath: false});

        drawContour(faceContours.lowerLip);
        drawContour(faceContours.upperLip);
        
        drawContour(faceContours.leftIris, {strokeStyle: "rgba(52, 211, 153, 0.95)",});
        drawContour(faceContours.rightIris, {strokeStyle: "rgba(52, 211, 153, 0.95)",});

        // 2. Draw all 478 mesh dots
        ctx.fillStyle = "rgba(6, 182, 212, 0.9)";
        landmarks.forEach((pt) => {
          const projected = project(pt);
          ctx.beginPath();
          ctx.arc(projected.x, projected.y, 0.8, 0, 2 * Math.PI);
          ctx.fill();
        });

        // 3. Draw hand skeletons if detected
        if (detections.gesture && detections.gesture.landmarks && detections.gesture.landmarks.length > 0) {
          ctx.strokeStyle = "rgba(245, 158, 11, 0.85)"; // Amber for hands
          ctx.fillStyle = "rgba(245, 158, 11, 0.8)";
          ctx.shadowColor = "rgba(245, 158, 11, 0.5)";

          detections.gesture.landmarks.forEach((handLandmarks) => {
            handConnections.forEach((conn) => {
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

        // 4. Draw privacy mode bounding box if enabled
        if (isPrivacyMode) {
          ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
          ctx.setLineDash([4, 4]);
          let minX = width, maxX = 0, minY = height, maxY = 0;
          landmarks.forEach((pt) => {
            const projected = project(pt);
            if (projected.x < minX) minX = projected.x;
            if (projected.x > maxX) maxX = projected.x;
            if (projected.y < minY) minY = projected.y;
            if (projected.y > maxY) maxY = projected.y;
          });
          const pad = 20;
          ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
          ctx.setLineDash([]);
            
          ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
          ctx.font = "10px monospace";
          ctx.fillText("FACE_TRACK_ACTIVE", minX - pad + 5, minY - pad + 15);
        }

        ctx.shadowBlur = 0;
        animationRef.current = requestAnimationFrame(drawMesh);
        return;
      }

      //If a human face is not detected, keep the mesh animation running to indicate that the system is still monitoring
      if (isAiLoaded) {
        animationRef.current = requestAnimationFrame(drawMesh);
        return;
      }

      //Show loading or warning messages and draw the base landmarks if AI is not yet loaded
      
      const now = performance.now();

      const elapsedMs = aiLoadingStartRef.current
        ? now - aiLoadingStartRef.current
        : 0;

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
        

        animationRef.current = requestAnimationFrame(drawMesh);
        return;
      }

      // Reset shadow
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(drawMesh);
    };

    drawMesh();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, [isMonitoring, isPrivacyMode, isCameraAllowed, isAiLoaded]);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-2xl backdrop-blur-xl">
      {/* Title / Header */}
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

        {/* Privacy Active Badge */}
        {isPrivacyMode && (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-cyan-500/20">
            🔒 Privacy Filter
          </span>
        )}
      </div>

      {/* Main Video/Canvas Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-950 border border-white/5 shadow-inner">
        {/* Actual Video Element */}
        {isCameraAllowed && (
          <video
            ref={videoRef}
            muted
            playsInline
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ${
              isPrivacyMode ? "blur-2xl opacity-20 scale-95" : "opacity-70"
            }`}
          />
        )}

        {/* Dynamic Canvas Mesh Overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 h-full w-full object-cover pointer-events-none"
        />

        {/* Privacy Mask Visual Effects */}
        {isPrivacyMode && (
          <div className="absolute inset-0 z-[5] bg-slate-950/40 pointer-events-none"></div>
        )}

        {/* No Face Detected */}
        {isMonitoring &&
          isCameraAllowed &&
          isAiLoaded &&
          !hasDetectedFace && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <p className="text-sm font-semibold tracking-wide text-slate-200">
                No Face Detected
              </p>
            </div>
          )}

        {/* Standby/No Camera Overlay */}
        {(!isCameraAllowed || !isMonitoring) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center">
            {!isCameraAllowed ? (
              <>
                <div className="rounded-full bg-slate-900 p-4 border border-white/5 mb-3">
                  <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Camera Stream Offline</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  AegisMind requires camera access to analyze facial postures and gestures.
                </p>
                <button
                  onClick={handleRequestAccess}
                  disabled={isInitializing}
                  className="mt-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-400 transition-all"
                >
                  {isInitializing ? "Initializing..." : "Enable Camera"}
                </button>
                {errorMsg && <p className="text-[10px] text-red-400 mt-2">{errorMsg}</p>}
              </>
            ) : (
              <>
                <div className="rounded-full bg-cyan-950/40 p-4 border border-cyan-500/10 mb-3">
                  <svg className="h-8 w-8 text-cyan-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Monitoring Paused</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  The camera feed is active, but mental state analysis is currently paused.
                </p>
                <button
                  onClick={toggleMonitoring}
                  className="mt-4 rounded-lg bg-slate-900 border border-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-all"
                >
                  Resume Study Session
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons */}
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
          {isMonitoring ? (
            <>
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Pause Session
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Start Session
            </>
          )}
        </button>

        {/* Privacy Mode Toggle */}
        <button
          onClick={() => setIsPrivacyMode(!isPrivacyMode)}
          disabled={!isCameraAllowed}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold border transition-all duration-300 ${
            !isCameraAllowed
              ? "border-white/5 text-slate-600 cursor-not-allowed bg-slate-900/40"
              : isPrivacyMode
              ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
              : "bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800"
          }`}
          title="Toggle Privacy Mode"
        >
          {isPrivacyMode ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          )}
          <span className="hidden sm:inline">Privacy Shield</span>
        </button>
        
        {/* Disable Webcam */}
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

      {/* Pre-flight Dialog Modal */}
      {showCameraDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl animate-in fade-in zoom-in duration-250">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-4">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-center text-lg font-bold text-white">Request Camera Access</h3>
            <p className="text-center text-xs text-slate-400 mt-2">
              AegisMind requires your camera to capture facial gestures and landmarks. 
              Our algorithms run 
              <strong className="font-semibold text-slate-300">
                entirely in your browser
              </strong>
              . No video or image data is ever sent to a server.
            </p>
            
            {/* Privacy note */}
            <div className="mt-4 rounded-lg bg-slate-900/60 p-3 border border-white/5 flex gap-2.5 items-start">
              <svg className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-[10px] font-bold text-white">Local-Only AI Processing</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Privacy Shield mode can be toggled at any time to blur the camera feed and display only the anonymous landmark wireframe.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowCameraDialog(false)}
                className="flex-1 rounded-xl border border-white/10 bg-slate-900 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestAccess}
                disabled={isInitializing}
                className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-400 transition-all"
              >
                {isInitializing ? "Allowing..." : "Grant Permission"}
              </button>
            </div>
            {errorMsg && <p className="text-center text-[10px] text-red-400 mt-3">{errorMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
