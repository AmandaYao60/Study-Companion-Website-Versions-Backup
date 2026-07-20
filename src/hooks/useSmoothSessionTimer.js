"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../context/AppContext";

export const formatElapsedTime = (elapsedMs) => {
  const totalSeconds = Math.floor(Math.max(elapsedMs, 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours > 0 ? String(hours).padStart(2, "0") : null,
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].filter(Boolean).join(":");
};

export default function useSmoothSessionTimer(refreshMs = 200) {
  const { sessionClock, getSessionElapsedMs } = useAppState();
  const [elapsedMs, setElapsedMs] = useState(() => getSessionElapsedMs());

  useEffect(() => {
    const refreshElapsed = () => setElapsedMs(getSessionElapsedMs());
    const timeout = window.setTimeout(refreshElapsed, 0);

    if (!sessionClock.isRunning) {
      return () => window.clearTimeout(timeout);
    }

    const interval = window.setInterval(refreshElapsed, refreshMs);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [getSessionElapsedMs, refreshMs, sessionClock]);

  return useMemo(() => ({
    elapsedMs,
    formatted: formatElapsedTime(elapsedMs),
    minuteProgress: (elapsedMs % 60000) / 600,
  }), [elapsedMs]);
}