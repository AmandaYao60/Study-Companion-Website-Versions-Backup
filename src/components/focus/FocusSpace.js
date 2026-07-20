"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppState } from "../../context/AppContext";
import CameraFeed from "../CameraFeed";
import CameraPermissionDialog from "../CameraPermissionDialog";
import FocusMonitorWindow from "./FocusMonitorWindow";
import FocusSessionControls from "./FocusSessionControls";
import FocusStagePlaceholder from "./FocusStagePlaceholder";

export default function FocusSpace() {
  const { isMonitoring } = useAppState();
  const stageRef = useRef(null);
  const [isMonitorHidden, setIsMonitorHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);

  useEffect(() => {
    if (isMonitoring) return undefined;

    const timeout = window.setTimeout(() => {
      setIsMonitorHidden(false);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isMonitoring]);

  useEffect(() => {
    const stage = stageRef.current;
    setIsFullscreenSupported(Boolean(stage?.requestFullscreen && document.exitFullscreen));

    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage || !isFullscreenSupported) return;

    if (document.fullscreenElement === stage) {
      await document.exitFullscreen();
    } else {
      await stage.requestFullscreen();
    }
  };

  return (
    <FocusStagePlaceholder stageRef={stageRef}>
      <FocusSessionControls
        isFullscreen={isFullscreen}
        isFullscreenSupported={isFullscreenSupported}
        onToggleFullscreen={toggleFullscreen}
      />

      {isMonitoring && !isMonitorHidden && (
        <FocusMonitorWindow
          stageRef={stageRef}
          onHide={() => setIsMonitorHidden(true)}
        />
      )}

      {isMonitoring && isMonitorHidden && (
        <div className="pointer-events-none absolute bottom-0 right-0 h-px w-px overflow-hidden opacity-0" aria-hidden="true">
          <CameraFeed presentation="focus-panel" showControls={false} />
        </div>
      )}

      {isMonitoring && isMonitorHidden && (
        <button
          type="button"
          onClick={() => setIsMonitorHidden(false)}
          className="absolute right-4 top-24 z-30 rounded-xl border border-cyan-400/20 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-cyan-200 shadow-xl backdrop-blur-xl transition-all hover:bg-slate-900 sm:right-6"
        >
          Show Monitor
        </button>
      )}

      <CameraPermissionDialog />
    </FocusStagePlaceholder>
  );
}