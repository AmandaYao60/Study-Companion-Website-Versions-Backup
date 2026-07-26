"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BREAK_DECISION_ALARM_REPLAY_MS,
  BREAK_DECISION_WAIT_MS,
  BREAK_EXTENSION_MS,
  BREAK_STATUS,
  MAX_BREAK_EXTENSION_COUNT,
  PRE_BREAK_WARNING_MS,
  SESSION_STATUS,
  completeBreak,
  markBreakDecisionAlarmReplayed,
  markBreakDecisionStarted,
  markBreakReady,
  markBreakWarningShown,
  normalizeBreakEvents,
  normalizeSessionPlan,
  skipBreak,
  startAdHocBreak as startAdHocBreakEvent,
  startBreakExtension,
  startPlannedBreak,
} from "../services/session/index.js";
import {
  AUTOMATIC_BREAK_EVENT_SOURCE,
  BREAK_MODE_AUTOMATIC,
} from "../services/session/automaticBreakSuggestionState.js";
import {
  BREAK_PHASE,
  createIdleBreakState,
  createTimedBreakViewState,
  findBreakEvent,
  getNextScheduledBreakEvent,
  isBreakBlockingPhase,
  isBreakModePhase,
} from "../services/session/timedBreakState.js";

export default function useTimedBreakController({
  router,
  session,
  monitoring,
  camera,
  audio,
  logger,
}) {
  const {
    activeSession,
    activeSessionRef,
    sessionClock,
    sessionRuntimeRef,
    getSessionElapsedMs,
    freezeSessionClock,
    startSessionClock,
    syncSessionState,
  } = session;
  const {
    setIsMonitoring,
    monitoringRef,
  } = monitoring;
  const {
    startCamera,
    clearCameraStream,
    resetTransientInferenceState,
    setShowCameraDialog,
  } = camera;
  const {
    isFocusSpaceActiveRef,
    playSessionAudio,
    stateRef: sessionAudioStateRef,
    stopAllSessionAudio,
    stopAudio,
  } = audio;
  const { addLog } = logger;

  const [state, setState] = useState(createIdleBreakState);
  const stateRef = useRef(state);
  const breakActionPromiseRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reset = useCallback(() => {
    setState(createIdleBreakState());
  }, []);

  const persistBreakSession = useCallback(async (nextSession, input = {}) => {
    const saved = await sessionRuntimeRef.current.updateBreakEvents(nextSession.breakEvents, input);
    syncSessionState();
    return saved;
  }, [sessionRuntimeRef, syncSessionState]);

  const runBreakAction = useCallback((operation) => {
    if (breakActionPromiseRef.current) return breakActionPromiseRef.current;
    const promise = operation().finally(() => {
      breakActionPromiseRef.current = null;
    });
    breakActionPromiseRef.current = promise;
    return promise;
  }, []);

  const enterBreakReady = useCallback((breakEvent) => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentBreakState = stateRef.current;
    const isAlreadyHandlingThisBreak = currentBreakState.breakId === breakEvent?.id &&
    isBreakBlockingPhase(currentBreakState.phase);
    if (!active || !breakEvent || isAlreadyHandlingThisBreak) return null;
    const elapsedMs = freezeSessionClock();
    await sessionRuntimeRef.current.flushPendingObservations({ force: true });
    const readyAt = new Date().toISOString();
    const nextSession = markBreakReady(active, breakEvent.id, {
      readyAt,
      baseDurationMs: breakEvent.baseDurationMs || active.sessionPlan?.breakDurationMs,
    });
    await persistBreakSession(nextSession, { accumulatedStudyMs: elapsedMs, lastCheckpointAt: readyAt });
    stopAudio("study");
    playSessionAudio("shortAlarm", { loop: false, restart: true });
    setState({
      ...createIdleBreakState(),
      phase: BREAK_PHASE.READY,
      breakId: breakEvent.id,
      plannedStartElapsedMs: breakEvent.plannedStartElapsedMs,
      baseDurationMs: breakEvent.baseDurationMs || active.sessionPlan?.breakDurationMs || 0,
    });
    addLog("Planned break is ready.", "info");
    return nextSession;
  }), [activeSessionRef, addLog, freezeSessionClock, persistBreakSession, playSessionAudio, runBreakAction, sessionRuntimeRef, stopAudio]);

  const requestSkipBreak = useCallback(() => {
    setState((previous) => previous.phase === BREAK_PHASE.READY
      ? { ...previous, phase: BREAK_PHASE.SKIP_CONFIRMATION }
      : previous);
  }, []);

  const cancelSkipBreak = useCallback(() => {
    setState((previous) => previous.phase === BREAK_PHASE.SKIP_CONFIRMATION
      ? { ...previous, phase: BREAK_PHASE.READY }
      : previous);
  }, []);

  const confirmSkipBreak = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentState = stateRef.current;
    if (!active || currentState.phase !== BREAK_PHASE.SKIP_CONFIRMATION || !currentState.breakId) return null;
    stopAudio("shortAlarm");
    const skippedAt = new Date().toISOString();
    const elapsedMs = getSessionElapsedMs();
    const nextSession = skipBreak(active, currentState.breakId, {
      actualEndElapsedMs: elapsedMs,
      actualEndAt: skippedAt,
    });
    await persistBreakSession(nextSession, { accumulatedStudyMs: elapsedMs, lastCheckpointAt: skippedAt });
    setState(createIdleBreakState());
    startSessionClock();
    setIsMonitoring(true);
    monitoringRef.current = true;
    addLog("Planned break skipped.", "warning");
    return nextSession;
  }), [activeSessionRef, addLog, getSessionElapsedMs, monitoringRef, persistBreakSession, runBreakAction, setIsMonitoring, startSessionClock, stopAudio]);

  const startReadyBreak = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentState = stateRef.current;
    if (!active || currentState.phase !== BREAK_PHASE.READY || !currentState.breakId) return null;
    stopAudio("shortAlarm");
    stopAudio("study");
    const startedAt = new Date().toISOString();
    const baseDurationMs = currentState.baseDurationMs || active.sessionPlan?.breakDurationMs || 0;
    const elapsedMs = getSessionElapsedMs();
    const nextSession = startPlannedBreak(active, currentState.breakId, {
      actualStartElapsedMs: elapsedMs,
      actualStartAt: startedAt,
      baseDurationMs,
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: baseDurationMs,
    });
    await persistBreakSession(nextSession, { accumulatedStudyMs: elapsedMs, lastCheckpointAt: startedAt });
    setState({
      ...createIdleBreakState(),
      phase: BREAK_PHASE.ACTIVE,
      breakId: currentState.breakId,
      plannedStartElapsedMs: currentState.plannedStartElapsedMs,
      baseDurationMs,
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: baseDurationMs,
      remainingMs: baseDurationMs,
    });
    setIsMonitoring(false);
    monitoringRef.current = false;
    clearCameraStream();
    resetTransientInferenceState();
    playSessionAudio("break", { loop: true, restart: true });
    router.replace("/app/focus");
    addLog("Planned break started. Camera and monitoring are stopped during break time.", "info");
    return nextSession;
  }), [activeSessionRef, addLog, clearCameraStream, getSessionElapsedMs, monitoringRef, persistBreakSession, playSessionAudio, resetTransientInferenceState, router, runBreakAction, setIsMonitoring, stopAudio]);

  const startAdHocBreak = useCallback(({
    durationMs,
    source = AUTOMATIC_BREAK_EVENT_SOURCE,
    suggestionThresholdMs = null,
  } = {}) => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentState = stateRef.current;
    if (!active || active.status !== SESSION_STATUS.ACTIVE || active.breakMode !== BREAK_MODE_AUTOMATIC) return null;
    if (isBreakBlockingPhase(currentState.phase)) return null;
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Break duration is required.");

    const startedAt = new Date().toISOString();
    const elapsedMs = freezeSessionClock();
    try {
      await sessionRuntimeRef.current.flushPendingObservations({ force: true });
      const nextSession = startAdHocBreakEvent(active, {
        actualStartElapsedMs: elapsedMs,
        plannedStartElapsedMs: elapsedMs,
        actualStartAt: startedAt,
        baseDurationMs: durationMs,
        durationMs,
        activeSegmentStartedAt: startedAt,
        activeSegmentDurationMs: durationMs,
        source,
        suggestionThresholdMs,
      });
      const nextEvent = nextSession.breakEvents.at(-1);
      await persistBreakSession(nextSession, { accumulatedStudyMs: elapsedMs, lastCheckpointAt: startedAt });
      stopAudio("shortAlarm");
      stopAudio("shortAlarm2");
      stopAudio("study");
      stopAudio("longAlarm");
      setState({
        ...createIdleBreakState(),
        phase: BREAK_PHASE.ACTIVE,
        breakId: nextEvent.id,
        plannedStartElapsedMs: nextEvent.plannedStartElapsedMs,
        baseDurationMs: durationMs,
        activeSegmentStartedAt: startedAt,
        activeSegmentDurationMs: durationMs,
        remainingMs: durationMs,
      });
      setIsMonitoring(false);
      monitoringRef.current = false;
      clearCameraStream();
      resetTransientInferenceState();
      playSessionAudio("break", { loop: true, restart: true });
      router.replace("/app/focus");
      addLog("Suggested break started. Camera and monitoring are stopped during break time.", "info");
      return nextSession;
    } catch (error) {
      startSessionClock();
      throw error;
    }
  }), [
    activeSessionRef,
    addLog,
    clearCameraStream,
    freezeSessionClock,
    monitoringRef,
    persistBreakSession,
    playSessionAudio,
    resetTransientInferenceState,
    router,
    runBreakAction,
    sessionRuntimeRef,
    setIsMonitoring,
    startSessionClock,
    stopAudio,
  ]);

  const completeActiveBreakSegment = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentState = stateRef.current;
    if (!active || currentState.phase !== BREAK_PHASE.ACTIVE || !currentState.breakId) return null;
    const event = findBreakEvent(active, currentState.breakId);
    if (!event) return null;
    stopAudio("break");
    const nowIso = new Date().toISOString();
    if ((event.extensionCount || 0) >= MAX_BREAK_EXTENSION_COUNT) {
      const nextSession = completeBreak(active, currentState.breakId, {
        actualEndElapsedMs: getSessionElapsedMs(),
        actualEndAt: nowIso,
        actualActiveBreakDurationMs: (event.baseDurationMs || currentState.baseDurationMs || 0) + (event.totalExtensionDurationMs || 0),
        totalExtensionDurationMs: event.totalExtensionDurationMs || 0,
      });
      await persistBreakSession(nextSession, {
        accumulatedStudyMs: getSessionElapsedMs(),
        status: SESSION_STATUS.PAUSED,
        recoveryPending: false,
        lastCheckpointAt: nowIso,
      });
      setIsMonitoring(false);
      monitoringRef.current = false;
      setState({ ...createIdleBreakState(), phase: BREAK_PHASE.PAUSED_FALLBACK });
      addLog("Break extension limit reached. The study session is paused until you are ready.", "warning");
      return nextSession;
    }
    const nextSession = markBreakDecisionStarted(active, currentState.breakId, { decisionStartedAt: nowIso });
    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: nowIso });
    setState((previous) => ({
      ...previous,
      phase: BREAK_PHASE.COMPLETE_DECISION,
      activeSegmentStartedAt: null,
      activeSegmentDurationMs: 0,
      remainingMs: 0,
      decisionStartedAt: nowIso,
      decisionElapsedMs: 0,
      extensionCount: event.extensionCount || 0,
    }));
    playSessionAudio("longAlarm", { loop: false, restart: true });
    return nextSession;
  }), [activeSessionRef, addLog, getSessionElapsedMs, monitoringRef, persistBreakSession, playSessionAudio, runBreakAction, setIsMonitoring, stopAudio]);

  const extendBreak = useCallback((source = "manual") => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentState = stateRef.current;
    if (!active || currentState.phase !== BREAK_PHASE.COMPLETE_DECISION || !currentState.breakId) return null;
    const event = findBreakEvent(active, currentState.breakId);
    if (!event || (event.extensionCount || 0) >= MAX_BREAK_EXTENSION_COUNT) return null;
    stopAudio("longAlarm");
    const startedAt = new Date().toISOString();
    const nextSession = startBreakExtension(active, currentState.breakId, {
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: BREAK_EXTENSION_MS,
      source,
    });
    const nextEvent = findBreakEvent(nextSession, currentState.breakId);
    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: startedAt });
    setState((previous) => ({
      ...previous,
      phase: BREAK_PHASE.ACTIVE,
      activeSegmentStartedAt: startedAt,
      activeSegmentDurationMs: BREAK_EXTENSION_MS,
      remainingMs: BREAK_EXTENSION_MS,
      decisionStartedAt: null,
      decisionElapsedMs: 0,
      extensionCount: nextEvent?.extensionCount || previous.extensionCount + 1,
    }));
    playSessionAudio("break", { loop: true, restart: true });
    return nextSession;
  }), [activeSessionRef, getSessionElapsedMs, persistBreakSession, playSessionAudio, runBreakAction, stopAudio]);

  const continueStudyAfterBreak = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentState = stateRef.current;
    if (!active || currentState.phase !== BREAK_PHASE.COMPLETE_DECISION || !currentState.breakId) return null;
    const event = findBreakEvent(active, currentState.breakId);
    stopAudio("longAlarm");
    const endedAt = new Date().toISOString();
    const activeBreakDuration = (event?.baseDurationMs || currentState.baseDurationMs || 0) + (event?.totalExtensionDurationMs || 0);
    const nextSession = completeBreak(active, currentState.breakId, {
      actualEndElapsedMs: getSessionElapsedMs(),
      actualEndAt: endedAt,
      actualActiveBreakDurationMs: activeBreakDuration,
      totalExtensionDurationMs: event?.totalExtensionDurationMs || 0,
    });

    stopAudio("longAlarm");
    stopAudio("break");
    if (isFocusSpaceActiveRef.current && !sessionAudioStateRef.current.muted) {
      playSessionAudio("study", {loop: true, restart: true,});
    }

    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: endedAt });
    try {
      await startCamera();
      startSessionClock();
      setIsMonitoring(true);
      monitoringRef.current = true;
      setState(createIdleBreakState());
      addLog("Study session resumed after break.", "success");
      return nextSession;
    } catch (error) {
      const paused = await sessionRuntimeRef.current.updateBreakEvents(nextSession.breakEvents, {
        accumulatedStudyMs: getSessionElapsedMs(),
        status: SESSION_STATUS.PAUSED,
        recoveryPending: false,
        lastCheckpointAt: endedAt,
      });
      stopAudio("study");
      syncSessionState();
      setState(createIdleBreakState());
      setShowCameraDialog(true);
      addLog("Camera could not restart after the break. The session is paused safely.", "error");
      return paused;
    }
  }), [activeSessionRef, addLog, getSessionElapsedMs, isFocusSpaceActiveRef, monitoringRef, persistBreakSession, playSessionAudio, sessionAudioStateRef, sessionRuntimeRef, setIsMonitoring, setShowCameraDialog, startCamera, startSessionClock, stopAudio, syncSessionState, runBreakAction]);

  const requestEndBreakEarly = useCallback(() => {
    setState((previous) => previous.phase === BREAK_PHASE.ACTIVE
      ? { ...previous, phase: BREAK_PHASE.END_EARLY_CONFIRMATION }
      : previous);
  }, []);

  const cancelEndBreakEarly = useCallback(() => {
    setState((previous) => previous.phase === BREAK_PHASE.END_EARLY_CONFIRMATION
      ? { ...previous, phase: BREAK_PHASE.ACTIVE }
      : previous);
  }, []);

  const confirmEndBreakEarly = useCallback(() => runBreakAction(async () => {
    const active = activeSessionRef.current;
    const currentState = stateRef.current;
    if (!active || currentState.phase !== BREAK_PHASE.END_EARLY_CONFIRMATION || !currentState.breakId) return null;
    const endedAt = new Date().toISOString();
    const event = findBreakEvent(active, currentState.breakId);
    stopAudio("break");
    const activeSegmentStarted = Date.parse(currentState.activeSegmentStartedAt || event?.activeSegmentStartedAt || "");
    const partialActiveMs = Number.isFinite(activeSegmentStarted) ? Math.max(0, Date.now() - activeSegmentStarted) : 0;
    const previousExtensionMs = Math.max(0, (event?.extensionCount || 0) * BREAK_EXTENSION_MS - (event?.activeSegmentDurationMs === BREAK_EXTENSION_MS ? BREAK_EXTENSION_MS : 0));
    const activeBreakDuration = Math.min(
      (event?.baseDurationMs || currentState.baseDurationMs || 0) + (event?.totalExtensionDurationMs || 0),
      (event?.baseDurationMs || currentState.baseDurationMs || 0) + previousExtensionMs + partialActiveMs
    );
    const nextSession = completeBreak(active, currentState.breakId, {
      actualEndElapsedMs: getSessionElapsedMs(),
      actualEndAt: endedAt,
      actualActiveBreakDurationMs: activeBreakDuration,
      totalExtensionDurationMs: event?.totalExtensionDurationMs || 0,
    });

    stopAudio("longAlarm");
    stopAudio("break");
    if (isFocusSpaceActiveRef.current && !sessionAudioStateRef.current.muted) {
        playSessionAudio("study", {loop: true, restart: true,});
    }

    await persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: endedAt });
    try {
      await startCamera();
      startSessionClock();
      setIsMonitoring(true);
      monitoringRef.current = true;
      setState(createIdleBreakState());
      addLog("Study session resumed after ending the break early.", "success");
      return nextSession;
    } catch {
      const paused = await sessionRuntimeRef.current.updateBreakEvents(nextSession.breakEvents, {
        accumulatedStudyMs: getSessionElapsedMs(),
        status: SESSION_STATUS.PAUSED,
        recoveryPending: false,
        lastCheckpointAt: endedAt,
      });
      stopAudio("study");
      syncSessionState();
      setState(createIdleBreakState());
      setShowCameraDialog(true);
      addLog("Camera could not restart after the break. The session is paused safely.", "error");
      return paused;
    }
  }), [activeSessionRef, addLog, getSessionElapsedMs, isFocusSpaceActiveRef, monitoringRef, persistBreakSession, playSessionAudio, sessionAudioStateRef, sessionRuntimeRef, setIsMonitoring, setShowCameraDialog, startCamera, startSessionClock, stopAudio, syncSessionState, runBreakAction]);

  useEffect(() => {
    const active = activeSession;
    if (
      !active ||
      active.status !== SESSION_STATUS.ACTIVE ||
      active.breakMode === BREAK_MODE_AUTOMATIC ||
      isBreakBlockingPhase(state.phase)
    ) {
      return undefined;
    }
    const plan = normalizeSessionPlan(active.sessionPlan, { targetDurationMs: active.targetDurationMs });
    if (!plan.focusDurationMs || !plan.breakDurationMs || plan.plannedBreakCount <= 0) {
      return undefined;
    }

    const evaluate = () => {
      const currentSession = activeSessionRef.current;
      const currentState = stateRef.current;
      if (
        !currentSession ||
        currentSession.status !== SESSION_STATUS.ACTIVE ||
        currentSession.breakMode === BREAK_MODE_AUTOMATIC ||
        isBreakBlockingPhase(currentState.phase)
      ) return;
      const nextBreak = getNextScheduledBreakEvent(currentSession);
      if (!nextBreak || !Number.isFinite(nextBreak.plannedStartElapsedMs)) {
        if (currentState.phase === BREAK_PHASE.WARNING) setState(createIdleBreakState());
        return;
      }

      const elapsedMs = getSessionElapsedMs();
      const remainingMs = nextBreak.plannedStartElapsedMs - elapsedMs;
      if (remainingMs <= 0) {
        void enterBreakReady(nextBreak).catch((error) => {
          console.error("Failed to enter planned break ready state:", error);
          addLog("Could not open the planned break prompt.", "error");
        });
        return;
      }

      if (remainingMs <= PRE_BREAK_WARNING_MS) {
        if (!nextBreak.warningShownAt) {
          const warningAt = new Date().toISOString();
          const nextSession = markBreakWarningShown(currentSession, nextBreak.id, { warningShownAt: warningAt });
          void persistBreakSession(nextSession, {
            accumulatedStudyMs: elapsedMs,
            lastCheckpointAt: warningAt,
          }).catch((error) => {
            console.error("Failed to persist break warning:", error);
          });
        }
        setState({
          ...createIdleBreakState(),
          phase: BREAK_PHASE.WARNING,
          breakId: nextBreak.id,
          plannedStartElapsedMs: nextBreak.plannedStartElapsedMs,
          baseDurationMs: nextBreak.baseDurationMs || currentSession.sessionPlan?.breakDurationMs || 0,
          remainingMs,
        });
      } else if (currentState.phase === BREAK_PHASE.WARNING) {
        setState(createIdleBreakState());
      }
    };

    evaluate();
    if (!sessionClock.isRunning) return undefined;
    const interval = window.setInterval(evaluate, 500);
    return () => window.clearInterval(interval);
  }, [
    activeSession,
    activeSessionRef,
    addLog,
    enterBreakReady,
    getSessionElapsedMs,
    persistBreakSession,
    sessionClock.isRunning,
    state.phase,
  ]);

  useEffect(() => {
    if (state.phase !== BREAK_PHASE.ACTIVE || !state.activeSegmentStartedAt) {
      return undefined;
    }

    const tick = () => {
      const currentState = stateRef.current;
      if (currentState.phase !== BREAK_PHASE.ACTIVE || !currentState.activeSegmentStartedAt) return;
      const startedAt = Date.parse(currentState.activeSegmentStartedAt);
      const durationMs = currentState.activeSegmentDurationMs || currentState.baseDurationMs || 0;
      const remainingMs = Math.max(0, startedAt + durationMs - Date.now());
      setState((previous) => previous.phase === BREAK_PHASE.ACTIVE
        ? { ...previous, remainingMs }
        : previous);
      if (remainingMs <= 0) {
        void completeActiveBreakSegment().catch((error) => {
          console.error("Failed to complete break segment:", error);
          addLog("Could not complete the planned break cleanly.", "error");
        });
      }
    };

    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [addLog, completeActiveBreakSegment, state.activeSegmentStartedAt, state.phase]);

  useEffect(() => {
    if (state.phase !== BREAK_PHASE.COMPLETE_DECISION || !state.decisionStartedAt) {
      return undefined;
    }

    const tick = () => {
      const currentState = stateRef.current;
      const active = activeSessionRef.current;
      if (currentState.phase !== BREAK_PHASE.COMPLETE_DECISION || !currentState.decisionStartedAt || !active || !currentState.breakId) return;
      const decisionElapsedMs = Math.max(0, Date.now() - Date.parse(currentState.decisionStartedAt));
      setState((previous) => previous.phase === BREAK_PHASE.COMPLETE_DECISION
        ? { ...previous, decisionElapsedMs }
        : previous);
      const event = findBreakEvent(active, currentState.breakId);
      if (
        event &&
        decisionElapsedMs >= BREAK_DECISION_ALARM_REPLAY_MS &&
        !event.decisionAlarmReplayedAt
      ) {
        const replayedAt = new Date().toISOString();
        const nextSession = markBreakDecisionAlarmReplayed(active, currentState.breakId, { decisionAlarmReplayedAt: replayedAt });
        void persistBreakSession(nextSession, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: replayedAt });
        playSessionAudio("longAlarm", { loop: false, restart: true });
      }
      if (decisionElapsedMs >= BREAK_DECISION_WAIT_MS && (event?.extensionCount || 0) < MAX_BREAK_EXTENSION_COUNT) {
        void extendBreak("automatic").catch((error) => {
          console.error("Failed to auto-extend break:", error);
        });
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [activeSessionRef, extendBreak, getSessionElapsedMs, persistBreakSession, playSessionAudio, state.decisionStartedAt, state.phase]);

  useEffect(() => {
    if (!activeSession) {
      stopAllSessionAudio();
      return;
    }

    const events = normalizeBreakEvents(activeSession.breakEvents || []);
    const activeBreak = events.find((event) => event.status === BREAK_STATUS.ACTIVE);
    if (!activeBreak) return;
    if (state.breakId === activeBreak.id && state.phase !== BREAK_PHASE.IDLE) return;

    if (activeBreak.decisionStartedAt) {
      const timeout = window.setTimeout(() => {
        setState({
          ...createIdleBreakState(),
          phase: BREAK_PHASE.COMPLETE_DECISION,
          breakId: activeBreak.id,
          plannedStartElapsedMs: activeBreak.plannedStartElapsedMs,
          baseDurationMs: activeBreak.baseDurationMs || activeSession.sessionPlan?.breakDurationMs || 0,
          extensionCount: activeBreak.extensionCount || 0,
          decisionStartedAt: activeBreak.decisionStartedAt,
          decisionElapsedMs: Math.max(0, Date.now() - Date.parse(activeBreak.decisionStartedAt)),
        });
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    if (activeBreak.activeSegmentStartedAt) {
      const remainingMs = Math.max(
        0,
        Date.parse(activeBreak.activeSegmentStartedAt) + (activeBreak.activeSegmentDurationMs || activeBreak.baseDurationMs || 0) - Date.now()
      );
      const timeout = window.setTimeout(() => {
        setIsMonitoring(false);
        monitoringRef.current = false;
        clearCameraStream();
        resetTransientInferenceState();
        setState({
          ...createIdleBreakState(),
          phase: BREAK_PHASE.ACTIVE,
          breakId: activeBreak.id,
          plannedStartElapsedMs: activeBreak.plannedStartElapsedMs,
          baseDurationMs: activeBreak.baseDurationMs || activeSession.sessionPlan?.breakDurationMs || 0,
          extensionCount: activeBreak.extensionCount || 0,
          activeSegmentStartedAt: activeBreak.activeSegmentStartedAt,
          activeSegmentDurationMs: activeBreak.activeSegmentDurationMs || activeBreak.baseDurationMs || 0,
          remainingMs,
        });
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activeSession, clearCameraStream, monitoringRef, resetTransientInferenceState, setIsMonitoring, state.breakId, state.phase, stopAllSessionAudio]);

  useEffect(() => {
    if (!isBreakModePhase(state.phase)) return;

    router.replace("/app/focus");
  }, [router, state.phase]);

  const actions = useMemo(() => ({
    startReadyBreak,
    requestSkipBreak,
    cancelSkipBreak,
    confirmSkipBreak,
    requestEndBreakEarly,
    cancelEndBreakEarly,
    confirmEndBreakEarly,
    continueStudyAfterBreak,
    extendBreak,
    startAdHocBreak,
  }), [
    cancelEndBreakEarly,
    cancelSkipBreak,
    confirmEndBreakEarly,
    confirmSkipBreak,
    continueStudyAfterBreak,
    extendBreak,
    requestEndBreakEarly,
    requestSkipBreak,
    startAdHocBreak,
    startReadyBreak,
  ]);

  const publicState = useMemo(() => createTimedBreakViewState(state), [state]);

  return useMemo(() => ({
    state,
    stateRef,
    publicState,
    actions,
    reset,
  }), [actions, publicState, reset, state]);
}
