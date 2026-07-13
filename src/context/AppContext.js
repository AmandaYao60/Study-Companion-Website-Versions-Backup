"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

const AppContext = createContext();

export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppProvider");
  }
  return context;
};

export const AppProvider = ({ children }) => {
  // Global Mode States
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  
  // Monitoring & Camera States
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraAllowed, setIsCameraAllowed] = useState(false);
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  // AI Web-SDK loading states
  const [isAiLoaded, setIsAiLoaded] = useState(false);
  const [aiLoadingProgress, setAiLoadingProgress] = useState(0);
  const [aiError, setAiError] = useState(null);
  const [inferenceFps, setInferenceFps] = useState(5);
  
  // Real-time table logging data
  const [telemetryTable, setTelemetryTable] = useState([]);
  const [rawLandmarksHistory, setRawLandmarksHistory] = useState([]);
  const [eyeOpenness, setEyeOpenness] = useState(1.0);

  const faceLandmarkerRef = useRef(null);
  const gestureRecognizerRef = useRef(null);
  const isAiInitializingRef = useRef(false);

  // Keep track of blink detection state
  const eyesClosedStartRef = useRef(null);
  const wasEyesClosedRef = useRef(false);
  const blinkTimestampsRef = useRef([]); // for rolling blink rate
  const bothHandsFrameCountRef = useRef(0);

  // Mental States (0 - 100)
  const [focus, setFocus] = useState(85);
  const [stress, setStress] = useState(30);
  const [fatigue, setFatigue] = useState(15);
  const [arousal, setArousal] = useState(45);

  // CV Telemetry (Debug Info)
  const [blinkRate, setBlinkRate] = useState(12); // blinks per minute
  const [yawnCount, setYawnCount] = useState(0);
  const [headPose, setHeadPose] = useState({ yaw: 2.1, pitch: -1.5, roll: 0.5 });
  const [currentGesture, setCurrentGesture] = useState("None");
  const [fps, setFps] = useState(30);
  const [latency, setLatency] = useState(18); // inference latency in ms

  // Event Log (for Debug Mode Console)
  const [eventLog, setEventLog] = useState([
    { id: 1, time: "10:40:15", message: "AI CV Model loaded successfully.", type: "info" },
    { id: 2, time: "10:40:16", message: "Calibration complete. Baseline established.", type: "info" }
  ]);

  // Historical data for charts (stores last 20 data points, taken every 3 seconds)
  const [metricsHistory, setMetricsHistory] = useState([]);

  const streamRef = useRef(null);

  // Helper to add log messages
  const addLog = useCallback((message, type = "info") => {
    const time = new Date().toTimeString().split(" ")[0];
    setEventLog((prev) => [
      { id: Date.now(), time, message, type },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  }, []);

  // AI Web-SDK loaders and updates
  const loadAiModels = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isAiLoaded || isAiInitializingRef.current) return;
    isAiInitializingRef.current = true;
    setAiLoadingProgress(10);
    addLog("Loading AI Models resolver...", "info");
    
    try {
      const { FilesetResolver, FaceLandmarker, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      
      setAiLoadingProgress(30);
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );
      
      setAiLoadingProgress(50);
      addLog("Initializing Face Landmarker...", "info");
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO"
      });
      
      setAiLoadingProgress(80);
      addLog("Initializing Gesture Recognizer...", "info");
      gestureRecognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
      
      setAiLoadingProgress(100);
      setIsAiLoaded(true);
      addLog("AI Web-SDK models loaded successfully.", "success");
    } catch (err) {
      console.error("AI Model Loading Error:", err);
      setAiError(err.message);
      addLog("Failed to load AI models: " + err.message, "error");
    }
  }, [isAiLoaded, addLog]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAiModels();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAiModels]);

  const updateAiMetrics = useCallback((faceResults, gestureResults, latencyTime) => {
    setLatency(latencyTime);

    let currentEyeOpenness = 1.0;
    let yawValue = 0;
    let pitchValue = 0;
    let rollValue = 0;
    let isBlinkDetected = false;
    let isLongClosureDetected = false;

    const timestamp = Date.now();
    const timeStr = new Date().toTimeString().split(" ")[0];

    let frameLandmarks = {
      timestamp,
      face: [],
      hand: []
    };

    if (faceResults && faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
      const landmarks = faceResults.faceLandmarks[0];
      frameLandmarks.face = landmarks.map((pt, idx) => ({ id: idx, x: pt.x, y: pt.y, z: pt.z }));

      if (faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0) {
        const blendshapes = faceResults.faceBlendshapes[0].categories;
        const blinkLeft = blendshapes.find(b => b.categoryName === "eyeBlinkLeft")?.score || 0;
        const blinkRight = blendshapes.find(b => b.categoryName === "eyeBlinkRight")?.score || 0;
        
        currentEyeOpenness = parseFloat((1 - (blinkLeft + blinkRight) / 2).toFixed(2));
        setEyeOpenness(currentEyeOpenness);

        const eyesClosed = currentEyeOpenness < 0.22;
        if (eyesClosed) {
          if (!wasEyesClosedRef.current) {
            eyesClosedStartRef.current = timestamp;
            wasEyesClosedRef.current = true;
          } else {
            const duration = timestamp - eyesClosedStartRef.current;
            if (duration > 1200) {
              isLongClosureDetected = true;
              addLog("Long eye closure detected (fatigue warning).", "warning");
              setFatigue((prev) => Math.min(100, Math.round(prev + 0.5)));
              setFocus((prev) => Math.max(0, Math.round(prev - 0.8)));
            }
          }
        } else {
          if (wasEyesClosedRef.current) {
            const duration = timestamp - eyesClosedStartRef.current;
            wasEyesClosedRef.current = false;
            eyesClosedStartRef.current = null;

            if (duration >= 80 && duration <= 450) {
              isBlinkDetected = true;
              blinkTimestampsRef.current.push(timestamp);
              addLog("Blink detected.", "debug");
            }
          }
        }
      }

      if (faceResults.facialTransformationMatrixes && faceResults.facialTransformationMatrixes.length > 0) {
        const matrix = faceResults.facialTransformationMatrixes[0].data;
        const r01 = matrix[1];
        const r11 = matrix[5];
        const r20 = matrix[8];
        const r21 = matrix[9];
        const r22 = matrix[10];

        yawValue = parseFloat((Math.atan2(r20, r22) * (180 / Math.PI)).toFixed(1));
        pitchValue = parseFloat((Math.atan2(-r21, Math.sqrt(r20 * r20 + r22 * r22)) * (180 / Math.PI)).toFixed(1));
        rollValue = parseFloat((Math.atan2(r01, r11) * (180 / Math.PI)).toFixed(1));

        setHeadPose({ yaw: yawValue, pitch: pitchValue, roll: rollValue });
      }
    }

    let activeG = "None";
    let handsCount = 0;
    let detectedGestures = [];

    if (
      gestureResults?.landmarks &&
      gestureResults.landmarks.length > 0
    ) {
      handsCount = gestureResults.landmarks.length;

      // Store landmarks from every detected hand
      gestureResults.landmarks.forEach((hand, handIndex) => {
        hand.forEach((point, pointIndex) => {
          frameLandmarks.hand.push({
            handId: handIndex,
            id: pointIndex,
            x: point.x,
            y: point.y,
            z: point.z,
          });
        });
      });

      // Store the highest-confidence gesture from each hand
      detectedGestures = (gestureResults.gestures ?? [])
        .map((gestureCandidates, handIndex) => {
          const topGesture = gestureCandidates?.[0];

          if (!topGesture) return null;

          return {
            handId: handIndex,
            name: topGesture.categoryName,
            score: topGesture.score,
          };
        })
        .filter(
          (gesture) =>
            gesture !== null &&
            gesture.score > 0.45 &&
            gesture.name !== "None"
        );

      // Choose the highest-confidence gesture as the primary gesture
      if (detectedGestures.length > 0) {
        const primaryGesture = detectedGestures.reduce(
          (best, current) =>
            current.score > best.score ? current : best
        );

        activeG = primaryGesture.name;
        setCurrentGesture(activeG);
      } else {
        setCurrentGesture("None");
      }

      // Avoid applying the same gesture effect twice
      const uniqueGestureNames = [
        ...new Set(
          detectedGestures.map((gesture) => gesture.name)
        ),
      ];

      uniqueGestureNames.forEach((gestureName) => {
        addLog(`Gesture detected: ${gestureName}`, "info");

        if (gestureName === "Closed_Fist") {
          setFocus((previous) =>
            Math.min(100, previous + 2)
          );
        } else if (gestureName === "Thumb_Up") {
          addLog(
            "Thumbs Up! Positive session reinforcement.",
            "success"
          );

          setFocus((previous) =>
            Math.min(100, previous + 5)
          );

          setStress((previous) =>
            Math.max(0, previous - 5)
          );
        }
      });
    } else {
      setCurrentGesture("None");
    }

    // Track sustained two-hand activity
    if (handsCount >= 2) {
      bothHandsFrameCountRef.current += 1;
    } else {
      bothHandsFrameCountRef.current = 0;
    }

    if (bothHandsFrameCountRef.current === 10) {
      addLog(
        "Sustained two-hand activity detected.",
        "warning"
      );

      setFocus((previous) =>
        Math.max(0, previous - 3)
      );
    }

    // Existing blink-rate logic continues here
    const oneMinAgo = timestamp - 60000;
    blinkTimestampsRef.current =
      blinkTimestampsRef.current.filter(
        (time) => time > oneMinAgo
      );

    setBlinkRate(blinkTimestampsRef.current.length);

    if (isMonitoring) {
      if (currentEyeOpenness < 0.65) {
        setFatigue((prev) => Math.min(100, Math.round(prev + 0.2)));
        setFocus((prev) => Math.max(0, Math.round(prev - 0.2)));
      }
      
      const isLookingAway = Math.abs(yawValue) > 22 || Math.abs(pitchValue) > 18;
      if (isLookingAway) {
        setFocus((prev) => Math.max(0, Math.round(prev - 0.5)));
        setArousal((prev) => Math.max(0, Math.round(prev - 0.3)));
      } else {
        setFocus((prev) => Math.min(100, Math.round(prev + 0.1)));
      }
    }

    const tableRow = {
      id: timestamp,
      time: timeStr,
      eyeOpenness: currentEyeOpenness,
      blink: isBlinkDetected ? "Yes" : "No",
      longClosure: isLongClosureDetected ? "Yes" : "No",
      yaw: yawValue,
      pitch: pitchValue,
      gesture: activeG,
      hands: handsCount
    };

    setTelemetryTable((prev) => [tableRow, ...prev.slice(0, 49)]);
    setRawLandmarksHistory((prev) => [frameLandmarks, ...prev.slice(0, 49)]);
  }, [isMonitoring, addLog]);

  const exportTelemetryCSV = () => {
    if (rawLandmarksHistory.length === 0) {
      alert("No raw landmarks recorded yet. Start camera monitoring to capture data.");
      return;
    }

    let csvContent = "Timestamp,Source,Point_ID,X,Y,Z\n";

    rawLandmarksHistory.forEach((frame) => {
      const ts = frame.timestamp;
      frame.face.forEach((pt) => {
        csvContent += `${ts},face,${pt.id},${pt.x.toFixed(4)},${pt.y.toFixed(4)},${pt.z.toFixed(4)}\n`;
      });
      frame.hand.forEach((pt) => {
        csvContent += `${ts},hand_${pt.handId},${pt.id},${pt.x.toFixed(4)},${pt.y.toFixed(4)},${pt.z.toFixed(4)}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `aegismind_raw_landmarks_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog("Exported raw landmark table to CSV.", "success");
  };

  // Camera WebRTC Handlers
  const startCamera = async () => {
    try {
      if (cameraStream) return true;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false
      });
      
      setCameraStream(stream);
      streamRef.current = stream;
      setIsCameraAllowed(true);
      addLog("Camera access granted. Live stream connected.", "success");
      return true;
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setIsCameraAllowed(false);
      addLog("Camera access denied or unavailable.", "error");
      throw err;
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    setIsCameraAllowed(false);
    setIsMonitoring(false);
    addLog("Camera stream stopped.", "info");
  };

  // Toggle Monitoring
  const toggleMonitoring = async () => {
    if (!isMonitoring) {
      // Starting
      if (!isCameraAllowed) {
        setShowCameraDialog(true);
      } else {
        setIsMonitoring(true);
        addLog("Mental state monitoring started.", "success");
      }
    } else {
      // Pausing
      setIsMonitoring(false);
      addLog("Mental state monitoring paused.", "warning");
    }
  };

  // Reset metrics
  const resetMetrics = () => {
    setFocus(80);
    setStress(25);
    setFatigue(10);
    setArousal(45);
    setYawnCount(0);
    setBlinkRate(12);
    setHeadPose({ yaw: 0, pitch: 0, roll: 0 });
    setCurrentGesture("None");
    setMetricsHistory([]);
    setTelemetryTable([]);
    setRawLandmarksHistory([]);
    addLog("Metrics reset to baseline.", "info");
  };

  // Initialize metrics history with some starting points
  useEffect(() => {
    const initialHistory = [];
    const now = Date.now();
    for (let i = 19; i >= 0; i--) {
      initialHistory.push({
        timestamp: new Date(now - i * 3000).toLocaleTimeString().split(" ")[0],
        focus: Math.max(60, Math.min(95, 80 + Math.sin(i * 0.5) * 10 + (Math.random() - 0.5) * 5)),
        stress: Math.max(15, Math.min(60, 30 + Math.cos(i * 0.5) * 8 + (Math.random() - 0.5) * 4)),
        fatigue: Math.max(5, Math.min(30, 15 - i * 0.5 + (Math.random() - 0.5) * 3)),
        arousal: Math.max(30, Math.min(70, 45 + Math.sin(i * 0.3) * 5 + (Math.random() - 0.5) * 3))
      });
    }
    const timer = setTimeout(() => {
      setMetricsHistory(initialHistory);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Background Simulation Loop (only when monitoring is active)
  useEffect(() => {
    if (!isMonitoring) return;

    // Fall back to simulation only if camera tracking is offline or models not loaded
    if (isCameraAllowed && isAiLoaded) return;

    const interval = setInterval(() => {
      // 1. Update general mental states with small random walk
      setFocus((prev) => {
        const delta = (Math.random() - 0.5) * 4;
        return Math.max(10, Math.min(100, Math.round(prev + delta)));
      });
      setStress((prev) => {
        const delta = (Math.random() - 0.48) * 4; // slight upward drift if working
        return Math.max(5, Math.min(100, Math.round(prev + delta)));
      });
      setFatigue((prev) => {
        const delta = (Math.random() - 0.45) * 2; // slow accumulation
        return Math.max(0, Math.min(100, Math.round(prev + delta)));
      });
      setArousal((prev) => {
        const delta = (Math.random() - 0.5) * 3;
        return Math.max(10, Math.min(100, Math.round(prev + delta)));
      });

      // Update FPS and latency slightly for realism
      setFps(() => Math.round(29 + Math.random() * 2));
      setLatency(() => Math.round(15 + Math.random() * 6));

      // 2. Roll for random CV events
      const roll = Math.random();

      if (roll < 0.12) {
        // Blink Event
        setBlinkRate((prev) => Math.max(8, Math.min(24, prev + (Math.random() > 0.5 ? 1 : -1))));
        addLog("Blink detected.", "debug");
      } else if (roll < 0.15) {
        // Head Pose Adjustment
        const newYaw = parseFloat(((Math.random() - 0.5) * 15).toFixed(1));
        const newPitch = parseFloat(((Math.random() - 0.5) * 10).toFixed(1));
        const newRoll = parseFloat(((Math.random() - 0.5) * 5).toFixed(1));
        setHeadPose({ yaw: newYaw, pitch: newPitch, roll: newRoll });
        addLog(`Head pose updated (Yaw: ${newYaw}°, Pitch: ${newPitch}°)`, "debug");
      } else if (roll < 0.17) {
        // Gesture Event
        const gestures = ["Hand on Chin", "Leaning Forward", "Resting Head", "Rubbing Eyes", "None"];
        const newGesture = gestures[Math.floor(Math.random() * gestures.length)];
        setCurrentGesture(newGesture);
        
        if (newGesture !== "None") {
          addLog(`Gesture detected: ${newGesture}`, "info");
          if (newGesture === "Resting Head") {
            setFatigue((prev) => Math.min(100, prev + 5));
            setFocus((prev) => Math.max(0, prev - 10));
          } else if (newGesture === "Leaning Forward") {
            setFocus((prev) => Math.min(100, prev + 8));
          } else if (newGesture === "Rubbing Eyes") {
            setFatigue((prev) => Math.min(100, prev + 8));
            setStress((prev) => Math.min(100, prev + 4));
          }
        }
      } else if (roll < 0.185) {
        // Yawn Event
        setYawnCount((prev) => prev + 1);
        setFatigue((prev) => Math.min(100, prev + 12));
        setFocus((prev) => Math.max(0, prev - 15));
        addLog("Yawn detected. Fatigue level spiked.", "warning");
      }

    }, 2000);

    return () => clearInterval(interval);
  }, [isMonitoring, isCameraAllowed, isAiLoaded, addLog]);

  // Log history points every 5 seconds when monitoring is active
  useEffect(() => {
    if (!isMonitoring) return;

    const historyInterval = setInterval(() => {
      const timeStr = new Date().toLocaleTimeString().split(" ")[0];
      setMetricsHistory((prev) => {
        const next = [
          ...prev,
          {
            timestamp: timeStr,
            focus,
            stress,
            fatigue,
            arousal
          }
        ];
        return next.slice(-20); // Keep last 20 points
      });
    }, 4000);

    return () => clearInterval(historyInterval);
  }, [isMonitoring, focus, stress, fatigue, arousal]);

  return (
    <AppContext.Provider
      value={{
        isDebugMode,
        setIsDebugMode,
        isPrivacyMode,
        setIsPrivacyMode,
        isMonitoring,
        setIsMonitoring,
        isCameraAllowed,
        setIsCameraAllowed,
        showCameraDialog,
        setShowCameraDialog,
        cameraStream,
        startCamera,
        stopCamera,
        toggleMonitoring,
        resetMetrics,
        focus,
        setFocus,
        stress,
        setStress,
        fatigue,
        setFatigue,
        arousal,
        setArousal,
        blinkRate,
        setBlinkRate,
        yawnCount,
        setYawnCount,
        headPose,
        setHeadPose,
        currentGesture,
        setCurrentGesture,
        fps,
        latency,
        eventLog,
        addLog,
        metricsHistory,
        
        // AI Web-SDK additions
        isAiLoaded,
        aiLoadingProgress,
        aiError,
        inferenceFps,
        setInferenceFps,
        telemetryTable,
        setTelemetryTable,
        rawLandmarksHistory,
        setRawLandmarksHistory,
        eyeOpenness,
        setEyeOpenness,
        faceLandmarkerRef,
        gestureRecognizerRef,
        updateAiMetrics,
        exportTelemetryCSV
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
