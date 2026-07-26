"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SESSION_STATUS } from "../services/session/sessionConstants.js";
import { BREAK_PHASE } from "../services/session/timedBreakState.js";

export const AUDIO_ASSETS = Object.freeze({
  study: "/music/studytime-music.mp3",
  break: "/music/breaktime-music.mp3",
  shortAlarm: "/music/short-alarm.mp3",
  shortAlarm2: "/music/short-alarm-2.mp3",
  longAlarm: "/music/long-alarm.mp3",
});

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

export function useSessionAudioController({ getPlaybackContext } = {}) {
  const [state, setState] = useState({
    volume: 0.55,
    muted: false,
    blocked: false,
  });
  const stateRef = useRef(state);
  const audioElementsRef = useRef({});
  const audioVolumeMultipliersRef = useRef({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const getAudioElement = useCallback((key) => {
    if (typeof Audio === "undefined") return null;
    const existing = audioElementsRef.current[key];
    if (existing) return existing;
    const audio = new Audio(AUDIO_ASSETS[key]);
    audio.preload = "auto";
    audioVolumeMultipliersRef.current[key] = audioVolumeMultipliersRef.current[key] ?? 1;
    audio.volume = stateRef.current.muted
      ? 0
      : clamp(stateRef.current.volume * audioVolumeMultipliersRef.current[key], 0, 1);
    audioElementsRef.current[key] = audio;
    return audio;
  }, []);

  const stopAudio = useCallback((key) => {
    const audio = audioElementsRef.current[key];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audioVolumeMultipliersRef.current[key] = 1;
    audio.volume = stateRef.current.muted ? 0 : stateRef.current.volume;
  }, []);

  const stopAllSessionAudio = useCallback(() => {
    Object.keys(audioElementsRef.current).forEach((key) => stopAudio(key));
  }, [stopAudio]);

  const playSessionAudio = useCallback((key, { loop = false, restart = true, volumeMultiplier = 1 } = {}) => {
    const audioState = stateRef.current;
    const audio = getAudioElement(key);
    if (!audio) return;
    const multiplier = clamp(Number(volumeMultiplier), 0, 1);
    audioVolumeMultipliersRef.current[key] = multiplier;
    audio.loop = loop;
    audio.volume = audioState.muted ? 0 : clamp(audioState.volume * multiplier, 0, 1);
    if (audioState.muted) return;
    if (restart) audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.then) {
      playPromise
        .then(() => {
          setState((previous) => previous.blocked ? { ...previous, blocked: false } : previous);
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;
          setState((previous) => previous.blocked ? previous : { ...previous, blocked: true });
        });
    }
  }, [getAudioElement]);

  const setVolume = useCallback((volume) => {
    const nextVolume = clamp(Number(volume), 0, 1);
    setState((previous) => ({ ...previous, volume: nextVolume, blocked: false }));
    Object.entries(audioElementsRef.current).forEach(([key, audio]) => {
      const multiplier = audioVolumeMultipliersRef.current[key] ?? 1;
      audio.volume = stateRef.current.muted ? 0 : clamp(nextVolume * multiplier, 0, 1);
    });
  }, []);

  const setMuted = useCallback((muted) => {
    const nextMuted = Boolean(muted);
    setState((previous) => ({ ...previous, muted: nextMuted, blocked: false }));
    Object.entries(audioElementsRef.current).forEach(([key, audio]) => {
      const multiplier = audioVolumeMultipliersRef.current[key] ?? 1;
      audio.volume = nextMuted ? 0 : clamp(stateRef.current.volume * multiplier, 0, 1);
    });
    if (nextMuted) stopAllSessionAudio();
  }, [stopAllSessionAudio]);

  const enableAudio = useCallback(() => {
    setState((previous) => ({ ...previous, muted: false, blocked: false }));
    const context = getPlaybackContext?.() || {};
    if (context.timedBreakPhase === BREAK_PHASE.ACTIVE) {
      playSessionAudio("break", { loop: true, restart: false });
    } else if (
      context.isFocusSpaceActive &&
      context.activeSessionStatus === SESSION_STATUS.ACTIVE &&
      context.sessionClockIsRunning
    ) {
      playSessionAudio("study", { loop: true, restart: false });
    }
  }, [getPlaybackContext, playSessionAudio]);

  useEffect(() => () => {
    Object.values(audioElementsRef.current).forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    audioElementsRef.current = {};
    audioVolumeMultipliersRef.current = {};
  }, []);

  return useMemo(() => ({
    state,
    stateRef,
    assets: AUDIO_ASSETS,
    getAudioElement,
    playSessionAudio,
    stopAudio,
    stopAllSessionAudio,
    setVolume,
    setMuted,
    enableAudio,
  }), [
    enableAudio,
    getAudioElement,
    playSessionAudio,
    setMuted,
    setVolume,
    state,
    stopAllSessionAudio,
    stopAudio,
  ]);
}

export function useSessionAudioPlaybackSync({
  activeSessionStatus,
  sessionClockIsRunning,
  isFocusSpaceActive,
  timedBreakPhase,
  audio,
}) {
  const {
    playSessionAudio,
    state,
    stopAllSessionAudio,
    stopAudio,
  } = audio;

  useEffect(() => {
    if (state.muted) {
      stopAllSessionAudio();
      return;
    }

    const isStudyAudioAllowed =
      isFocusSpaceActive &&
      activeSessionStatus === SESSION_STATUS.ACTIVE &&
      sessionClockIsRunning &&
      ![
        BREAK_PHASE.READY,
        BREAK_PHASE.SKIP_CONFIRMATION,
        BREAK_PHASE.ACTIVE,
        BREAK_PHASE.END_EARLY_CONFIRMATION,
        BREAK_PHASE.COMPLETE_DECISION,
      ].includes(timedBreakPhase);

    if (timedBreakPhase === BREAK_PHASE.ACTIVE) {
      stopAudio("study");
      stopAudio("shortAlarm");
      stopAudio("shortAlarm2");
      stopAudio("longAlarm");
      playSessionAudio("break", { loop: true, restart: false });
    } else if (isStudyAudioAllowed) {
      stopAudio("break");
      playSessionAudio("study", { loop: true, restart: false });
    } else {
      stopAudio("study");
      if (timedBreakPhase !== BREAK_PHASE.COMPLETE_DECISION) stopAudio("longAlarm");
      if (timedBreakPhase !== BREAK_PHASE.READY) stopAudio("shortAlarm");
      stopAudio("shortAlarm2");
      if (timedBreakPhase !== BREAK_PHASE.ACTIVE) stopAudio("break");
    }
  }, [
    activeSessionStatus,
    isFocusSpaceActive,
    playSessionAudio,
    sessionClockIsRunning,
    state,
    stopAllSessionAudio,
    stopAudio,
    timedBreakPhase,
  ]);
}
