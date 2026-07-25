"use client";

import React, { useRef, useState } from "react";
import { useMonitoring, useSession } from "../context/AppContext";

export default function CameraPermissionDialog() {
  const {
    showCameraDialog,
    setShowCameraDialog,
    startCamera,
    stopCamera,
    isMonitoring,
  } = useMonitoring();
  const {
    activatePreparedSession,
    activeSession,
  } = useSession();
  const [isInitializing, setIsInitializing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const requestInFlightRef = useRef(false);

  if (!showCameraDialog) return null;

  const handleRequestAccess = async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setIsInitializing(true);
    setErrorMsg("");
    let cameraStarted = false;
    try {
      await startCamera();
      cameraStarted = true;
      await activatePreparedSession();
      setShowCameraDialog(false);
    } catch {
      if (cameraStarted) {
        await stopCamera({ pauseActiveSession: false }).catch((error) => {
          console.error("Failed to stop camera after session activation failed:", error);
        });
      }
      setErrorMsg("Could not access camera. Please ensure permissions are granted and no other app is using it.");
    } finally {
      requestInFlightRef.current = false;
      setIsInitializing(false);
    }
  };

  const handleCancel = () => {
    setShowCameraDialog(false);
    if (!isMonitoring && activeSession?.status === "prepared") {
      void stopCamera({ pauseActiveSession: false }).catch((error) => {
        console.error("Failed to stop camera after cancelling permission dialog:", error);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl animate-in fade-in zoom-in duration-250">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-center text-lg font-bold text-white">Request Camera Access</h3>
        <p className="mt-2 text-center text-xs text-slate-400">
          AegisMind uses the camera for browser-local MediaPipe and ONNX inference.
          Face images are not uploaded or stored by the application.
        </p>

        <div className="mt-4 flex gap-2.5 rounded-lg border border-white/5 bg-slate-900/60 p-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <p className="text-[10px] font-bold text-white">Local-Only AI Processing</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Camera frames stay in browser memory for live inference and are not sent to a backend service.
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleCancel}
            disabled={isInitializing}
            className="flex-1 rounded-xl border border-white/10 bg-slate-900 py-2.5 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleRequestAccess}
            disabled={isInitializing}
            className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-blue-400 disabled:cursor-wait disabled:opacity-70"
          >
            {isInitializing ? "Allowing..." : "Grant Permission"}
          </button>
        </div>
        {errorMsg && <p className="mt-3 text-center text-[10px] text-red-400">{errorMsg}</p>}
      </div>
    </div>
  );
}
