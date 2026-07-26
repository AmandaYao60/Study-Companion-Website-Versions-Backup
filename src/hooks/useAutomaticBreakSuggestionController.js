"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { BREAK_STATUS, SESSION_STATUS } from "../services/session/sessionConstants.js";
import {
  AUTOMATIC_BREAK_EVENT_SOURCE,
  AUTOMATIC_SUGGESTION_OUTCOME,
  AUTOMATIC_SUGGESTION_PHASE,
  BREAK_MODE_AUTOMATIC,
  createIdleAutomaticBreakSuggestionState,
  getAutomaticBreakTimingProfile,
  isDebugTimingMode,
  isWeakSuggestionLevel,
  markAutomaticThresholdHandled,
  normalizeAutomaticBreakSuggestionState,
  openAutomaticBreakPrompt,
  resetAutomaticBreakCycle,
  resolveExpiredAutomaticPrompt,
  selectNextAutomaticSuggestion,
  shouldShowManualAutomaticBreakEntry,
  AUTOMATIC_DURATION_CHOOSER_ORIGIN,
} from "../services/session/automaticBreakSuggestionState.js";

const isAutomaticActiveSession = (session) => (
  session?.status === SESSION_STATUS.ACTIVE &&
  session.breakMode === BREAK_MODE_AUTOMATIC
);

const nowIso = () => new Date().toISOString();

const getLatestHandledThreshold = (state) => (
  [...(state.handledThresholds || [])].sort((a, b) => b.handledAtElapsedMs - a.handledAtElapsedMs)[0] || null
);

export default function useAutomaticBreakSuggestionController({
  session,
  timedBreak,
  audio,
  logger,
}) {
  const {
    activeSession,
    activeSessionRef,
    sessionClock,
    sessionRuntimeRef,
    getSessionElapsedMs,
    syncSessionState,
  } = session;
  const {
    state: timedBreakState,
    actions: timedBreakActions,
  } = timedBreak;
  const {
    playSessionAudio,
    stopAudio,
  } = audio;
  const { addLog } = logger;
  const actionPromiseRef = useRef(null);
  const evaluationPromiseRef = useRef(null);

  const timingMode = isDebugTimingMode(activeSession?.sessionPlan) ? "debug" : "regular";
  const profile = useMemo(() => getAutomaticBreakTimingProfile(timingMode), [timingMode]);
  const state = useMemo(() => normalizeAutomaticBreakSuggestionState(
    activeSession?.automaticBreakSuggestionState || createIdleAutomaticBreakSuggestionState(),
    { timingMode }
  ), [activeSession?.automaticBreakSuggestionState, timingMode]);

  const persistState = useCallback(async (nextState, input = {}) => {
    const saved = await sessionRuntimeRef.current.updateAutomaticBreakSuggestionState(nextState, input);
    syncSessionState();
    return saved;
  }, [sessionRuntimeRef, syncSessionState]);

  const runAction = useCallback((operation) => {
    if (actionPromiseRef.current) return actionPromiseRef.current;
    const promise = operation().finally(() => {
      actionPromiseRef.current = null;
    });
    actionPromiseRef.current = promise;
    return promise;
  }, []);

  const runEvaluationPersistence = useCallback((operation) => {
    if (evaluationPromiseRef.current) {
      return evaluationPromiseRef.current;
    }

    const promise = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (evaluationPromiseRef.current === promise) {
          evaluationPromiseRef.current = null;
        }
      });

    evaluationPromiseRef.current = promise;
    return promise;
  }, []);

  const reset = useCallback(() => {
    const active = activeSessionRef.current;
    if (!active) return Promise.resolve(null);
    return persistState(createIdleAutomaticBreakSuggestionState(), { updatedAt: nowIso() });
  }, [activeSessionRef, persistState]);

  const handlePrompt = useCallback((outcome) => runAction(async () => {
    const active = activeSessionRef.current;
    if (!isAutomaticActiveSession(active)) return null;
    const currentState = normalizeAutomaticBreakSuggestionState(active.automaticBreakSuggestionState, {
      timingMode: active.sessionPlan?.timingMode,
    });
    if (!currentState.activePrompt) return null;
    stopAudio("shortAlarm");
    stopAudio("shortAlarm2");
    const handledAt = nowIso();
    const nextState = markAutomaticThresholdHandled(currentState, {
      outcome,
      handledAtElapsedMs: getSessionElapsedMs(),
      handledAt,
      timingMode: active.sessionPlan?.timingMode,
    });
    return persistState(nextState, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: handledAt });
  }), [activeSessionRef, getSessionElapsedMs, persistState, runAction, stopAudio]);

  const remindMeLater = useCallback(() => handlePrompt(AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED), [handlePrompt]);

  const requestContinueStudy = useCallback(() => runAction(async () => {
    const active = activeSessionRef.current;
    if (!isAutomaticActiveSession(active)) return null;
    const currentState = normalizeAutomaticBreakSuggestionState(active.automaticBreakSuggestionState, {
      timingMode: active.sessionPlan?.timingMode,
    });
    const prompt = currentState.activePrompt;
    if (!prompt || isWeakSuggestionLevel(prompt.level)) return null;
    const nextState = {
      ...currentState,
      activePrompt: {
        ...prompt,
        phase: AUTOMATIC_SUGGESTION_PHASE.CONTINUE_CONFIRMATION,
        expiresAt: null,
      },
    };
    return persistState(nextState, { updatedAt: nowIso() });
  }), [activeSessionRef, persistState, runAction]);

  const cancelContinueStudy = useCallback(() => runAction(async () => {
    const active = activeSessionRef.current;
    if (!isAutomaticActiveSession(active)) return null;
    const currentState = normalizeAutomaticBreakSuggestionState(active.automaticBreakSuggestionState, {
      timingMode: active.sessionPlan?.timingMode,
    });
    const prompt = currentState.activePrompt;
    if (!prompt || prompt.phase !== AUTOMATIC_SUGGESTION_PHASE.CONTINUE_CONFIRMATION) return null;
    const nextState = {
      ...currentState,
      activePrompt: {
        ...prompt,
        phase: AUTOMATIC_SUGGESTION_PHASE.SUGGESTION,
        expiresAt: null,
      },
    };
    return persistState(nextState, { updatedAt: nowIso() });
  }), [activeSessionRef, persistState, runAction]);

  const confirmContinueStudy = useCallback(() => handlePrompt(AUTOMATIC_SUGGESTION_OUTCOME.CONTINUED), [handlePrompt]);

  const openDurationChooser = useCallback(() => runAction(async () => {
    const active = activeSessionRef.current;
    if (!isAutomaticActiveSession(active)) return null;
    if (timedBreakState.isBlocking || timedBreakState.isBreakMode) return null;
    const currentState = normalizeAutomaticBreakSuggestionState(active.automaticBreakSuggestionState, {
      timingMode: active.sessionPlan?.timingMode,
    });
    const prompt = currentState.activePrompt;
    const handled = getLatestHandledThreshold(currentState);
    const nextPrompt = prompt || handled;
    if (!nextPrompt) return null;
    const nextState = {
      ...currentState,
      activePrompt: {
        thresholdMs: nextPrompt.thresholdMs,
        level: nextPrompt.level,
        openedAt: nowIso(),
        expiresAt: null,
        alarmAttemptedAt: prompt?.alarmAttemptedAt || null,
        phase: AUTOMATIC_SUGGESTION_PHASE.DURATION_CHOOSER,
        durationChooserOrigin: prompt
          ? AUTOMATIC_DURATION_CHOOSER_ORIGIN.SUGGESTION
          : AUTOMATIC_DURATION_CHOOSER_ORIGIN.MANUAL_ENTRY,
      },
    };
    stopAudio("shortAlarm");
    stopAudio("shortAlarm2");
    return persistState(nextState, { updatedAt: nowIso() });
  }), [activeSessionRef, persistState, runAction, stopAudio, timedBreakState.isBlocking, timedBreakState.isBreakMode]);

  const cancelDurationChooser = useCallback(() => runAction(async () => {
    const active = activeSessionRef.current;
    if (!isAutomaticActiveSession(active)) return null;
    const currentState = normalizeAutomaticBreakSuggestionState(active.automaticBreakSuggestionState, {
      timingMode: active.sessionPlan?.timingMode,
    });
    const prompt = currentState.activePrompt;
    if (!prompt || prompt.phase !== AUTOMATIC_SUGGESTION_PHASE.DURATION_CHOOSER) return null;
    if (prompt.durationChooserOrigin === AUTOMATIC_DURATION_CHOOSER_ORIGIN.MANUAL_ENTRY) {
      return persistState({...currentState, activePrompt: null,}, {updatedAt: nowIso(),});
    }
    const handledAt = nowIso();
    const nextState = markAutomaticThresholdHandled(currentState, {
      outcome: AUTOMATIC_SUGGESTION_OUTCOME.DEFERRED,
      handledAtElapsedMs: getSessionElapsedMs(),
      handledAt,
      timingMode: active.sessionPlan?.timingMode,
    });
    return persistState(nextState, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: handledAt });
  }), [activeSessionRef, getSessionElapsedMs, persistState, runAction]);

  const startSuggestedBreak = useCallback((durationMs) => runAction(async () => {
    const active = activeSessionRef.current;
    if (!isAutomaticActiveSession(active)) return null;
    const currentState = normalizeAutomaticBreakSuggestionState(active.automaticBreakSuggestionState, {
      timingMode: active.sessionPlan?.timingMode,
    });
    const prompt = currentState.activePrompt;
    const handled = getLatestHandledThreshold(currentState);
    const sourceThreshold = prompt || handled;
    if (!sourceThreshold || !profile.durationChoicesMs.includes(durationMs)) return null;
    stopAudio("shortAlarm");
    stopAudio("shortAlarm2");
    const nextSession = await timedBreakActions.startAdHocBreak({
      durationMs,
      source: AUTOMATIC_BREAK_EVENT_SOURCE,
      suggestionThresholdMs: sourceThreshold.thresholdMs,
    });
    if (!nextSession) return null;
    const handledAt = nowIso();
    const nextState = markAutomaticThresholdHandled(currentState, {
      thresholdMs: sourceThreshold.thresholdMs,
      level: sourceThreshold.level,
      outcome: AUTOMATIC_SUGGESTION_OUTCOME.BREAK_STARTED,
      handledAtElapsedMs: getSessionElapsedMs(),
      handledAt,
      timingMode: active.sessionPlan?.timingMode,
    });
    await persistState(nextState, { accumulatedStudyMs: getSessionElapsedMs(), lastCheckpointAt: handledAt });
    return nextSession;
  }), [activeSessionRef, getSessionElapsedMs, persistState, profile.durationChoicesMs, runAction, stopAudio, timedBreakActions]);

  useEffect(() => {
    const active = activeSession;
    if (!isAutomaticActiveSession(active)) {
      stopAudio("shortAlarm2");
      return undefined;
    }

    const currentState = normalizeAutomaticBreakSuggestionState(active.automaticBreakSuggestionState, {
      timingMode: active.sessionPlan?.timingMode,
    });
    const completedSuggestedBreak = (active.breakEvents || [])
      .filter((event) => (
        event.source === AUTOMATIC_BREAK_EVENT_SOURCE &&
        event.status === BREAK_STATUS.COMPLETED &&
        Number.isFinite(event.actualEndElapsedMs) &&
        event.actualEndElapsedMs > currentState.cycleStartElapsedMs
      ))
      .sort((a, b) => b.actualEndElapsedMs - a.actualEndElapsedMs)[0];

    if (completedSuggestedBreak) {
      const nextState = resetAutomaticBreakCycle(currentState, {
        cycleStartElapsedMs: completedSuggestedBreak.actualEndElapsedMs,
        timingMode: active.sessionPlan?.timingMode,
      });
      void persistState(nextState, { accumulatedStudyMs: completedSuggestedBreak.actualEndElapsedMs, lastCheckpointAt: nowIso() });
    }
    return undefined;
  }, [activeSession, persistState, stopAudio]);

  useEffect(() => {
    const active = activeSession;
    if (
      !isAutomaticActiveSession(active) ||
      !sessionClock.isRunning ||
      timedBreakState.isBlocking ||
      timedBreakState.isBreakMode
    ) {
      return undefined;
    }

    const evaluate = () => {
      if (evaluationPromiseRef.current || actionPromiseRef.current) return;
      const currentSession = activeSessionRef.current;
      if (
        !isAutomaticActiveSession(currentSession) ||
        !sessionClock.isRunning ||
        timedBreakState.isBlocking ||
        timedBreakState.isBreakMode
      ) {
        return;
      }
      const currentTimingMode = currentSession.sessionPlan?.timingMode;
      const elapsedMs = getSessionElapsedMs();
      const currentState = normalizeAutomaticBreakSuggestionState(currentSession.automaticBreakSuggestionState, {
        timingMode: currentTimingMode,
      });
      const resolved = resolveExpiredAutomaticPrompt(currentState, {
        now: nowIso(),
        elapsedMs,
        timingMode: currentTimingMode,
      });

      if (resolved !== currentState && !resolved.activePrompt && currentState.activePrompt) {
        void runEvaluationPersistence(() =>  persistState(resolved, {accumulatedStudyMs: elapsedMs, lastCheckpointAt: nowIso(),})
        ).catch((error) => {
          console.error("Failed to resolve expired break suggestion:", error);
        });
        return;
      }

      if (currentState.activePrompt) return;

      const nextSuggestion = selectNextAutomaticSuggestion({
        state: currentState,
        elapsedMs,
        targetDurationMs: currentSession.targetDurationMs,
        timingMode: currentTimingMode,
      });
      if (!nextSuggestion) return;
      const openedAt = nowIso();
      const nextState = openAutomaticBreakPrompt(currentState, {
        ...nextSuggestion,
        now: openedAt,
        timingMode: currentTimingMode,
      });
      void runEvaluationPersistence(async () => {
        await persistState(nextState, {accumulatedStudyMs: elapsedMs, lastCheckpointAt: openedAt,});
        const latestSession = activeSessionRef.current;
        const latestState = normalizeAutomaticBreakSuggestionState(latestSession?.automaticBreakSuggestionState, {timingMode: latestSession?.sessionPlan?.timingMode,});
        const isStillSamePrompt =
          latestState.activePrompt?.thresholdMs === nextSuggestion.thresholdMs &&
          latestState.activePrompt?.openedAt === openedAt;
        if (!isStillSamePrompt) return;
        if (isWeakSuggestionLevel(nextSuggestion.level)) {
          playSessionAudio("shortAlarm2", {loop: false, restart: true, volumeMultiplier: 0.5,});
        } else {
          playSessionAudio("shortAlarm", {loop: false, restart: true,});
        }
      }).catch((error) => {
        console.error("Failed to open automatic break suggestion:", error);
        addLog("Could not open the break suggestion.", "error");
      });
    };

    evaluate();
    const interval = window.setInterval(evaluate, 500);
    return () => window.clearInterval(interval);
  }, [
    activeSession,
    activeSessionRef,
    addLog,
    getSessionElapsedMs,
    persistState,
    playSessionAudio,
    sessionClock.isRunning,
    timedBreakState.isBlocking,
    timedBreakState.isBreakMode,
    runEvaluationPersistence,
  ]);

  const showManualStartBreak = useMemo(() => (
    isAutomaticActiveSession(activeSession) &&
    shouldShowManualAutomaticBreakEntry(state, { timingMode }) &&
    !timedBreakState.isBlocking &&
    !timedBreakState.isBreakMode
  ), [activeSession, state, timedBreakState.isBlocking, timedBreakState.isBreakMode, timingMode]);

  const publicState = useMemo(() => ({
    ...state,
    activePrompt: isAutomaticActiveSession(activeSession) ? state.activePrompt : null,
    isAutomaticMode: activeSession?.breakMode === BREAK_MODE_AUTOMATIC,
    showManualStartBreak,
    durationChoicesMs: profile.durationChoicesMs,
    timingMode: profile.timingMode,
    unitLabel: profile.unitLabel,
    promptTimeoutMs: profile.promptTimeoutMs,
  }), [activeSession, profile, showManualStartBreak, state]);

  const actions = useMemo(() => ({
    remindMeLater,
    requestContinueStudy,
    cancelContinueStudy,
    confirmContinueStudy,
    openDurationChooser,
    cancelDurationChooser,
    startSuggestedBreak,
  }), [
    cancelContinueStudy,
    cancelDurationChooser,
    confirmContinueStudy,
    openDurationChooser,
    remindMeLater,
    requestContinueStudy,
    startSuggestedBreak,
  ]);

  return useMemo(() => ({
    state: publicState,
    publicState,
    actions,
    reset,
  }), [actions, publicState, reset]);
}
