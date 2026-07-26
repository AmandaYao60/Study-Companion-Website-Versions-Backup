"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebug, useSession } from "../../context/AppContext";
import {
  calculatePlannedBreakPositions,
  coerceDebugBreakDurationForFocus,
  coerceBreakDurationForFocus,
  getAllowedBreakDurations,
  getAllowedFocusDurations,
  isValidDebugBreakDuration,
  isValidDebugBreakFocusDuration,
  normalizeSessionPlan,
} from "../../services/session/index.js";
import {
  BREAK_MODE_AUTOMATIC,
  BREAK_MODE_REGULAR,
  TIMING_MODE_DEBUG,
} from "../../services/session/automaticBreakSuggestionState.js";
import {
  AUTO_ADVANCE_IDLE_MS,
  NAV_DIRECTION,
  QUESTION_TRANSITION_MS,
  REDUCED_MOTION_TRANSITION_MS,
  TRANSITION_PHASE,
  getCircularNavButtonClass,
  getQuestionTransitionClass,
  isSingleChoiceAutoAdvanceStep,
} from "./questionnaireNavigation.js";

const targetOptions = [
  { label: "25 min", value: 25 },
  { label: "45 min", value: 45 },
  { label: "60 min", value: 60 },
  { label: "90 min", value: 90 },
  { label: "Custom", value: "custom" },
];

const subjectOptions = [
  ["mathematics", "Mathematics"],
  ["physics", "Physics"],
  ["chemistry", "Chemistry"],
  ["biology", "Biology"],
  ["computer_science", "Computer Science"],
  ["languages", "Languages"],
  ["humanities", "Humanities"],
  ["test_preparation", "Test Preparation"],
  ["other", "Other"],
];

const taskTypeOptions = [
  ["learn_new_content", "Learn new content"],
  ["practice_problems", "Practice problems"],
  ["review", "Review"],
  ["memorization", "Memorization"],
  ["reading", "Reading"],
  ["writing", "Writing"],
  ["project_work", "Project work"],
  ["test_preparation", "Test preparation"],
  ["other", "Other"],
];

const ratingQuestions = {
  expectedDifficulty: {
    question: "Based on your current skills, how difficult do you expect this task to be?",
    anchors: ["1 = Very easy", "3 = Moderate", "5 = Very difficult"],
  },
  taskConfidence: {
    question: "How confident are you that you can achieve this session's goal through your own effort?",
    anchors: ["1 = Not confident", "3 = Moderately confident", "5 = Completely confident"],
  },
  mood: {
    question: "How negative or positive do you feel right now?",
    anchors: ["1 = Very negative", "3 = Neutral", "5 = Very positive"],
  },
  energy: {
    question: "How alert and energetic do you feel right now?",
    anchors: ["1 = Very low or sleepy", "3 = Moderate", "5 = Very alert and energetic"],
  },
  taskValue: {
    question: "How important or valuable is this task to you?",
    anchors: ["1 = Very little value", "3 = Moderate value", "5 = Extremely valuable"],
  },
};

const optionalSteps = [
  { id: "subject", type: "choice", question: "What subject are you working on?", options: subjectOptions },
  { id: "taskType", type: "choice", question: "What kind of learning activity are you planning?", options: taskTypeOptions },
  { id: "sessionGoal", type: "text", question: "What would you like to accomplish in this session?", placeholder: "Finish Chapters 4-5 in Princeton Review." },
  { id: "expectedDifficulty", type: "rating", ...ratingQuestions.expectedDifficulty },
  { id: "taskConfidence", type: "rating", ...ratingQuestions.taskConfidence },
  { id: "mood", type: "rating", ...ratingQuestions.mood },
  { id: "energy", type: "rating", ...ratingQuestions.energy },
  { id: "taskValue", type: "rating", ...ratingQuestions.taskValue },
];

const initialDraft = {
  taskName: "",
  targetChoice: 25,
  customMinutes: "",
  subject: null,
  customSubject: "",
  taskType: null,
  customTaskType: "",
  sessionGoal: "",
  preSessionCheckIn: {
    expectedDifficulty: null,
    taskConfidence: null,
    mood: null,
    energy: null,
    taskValue: null,
  },
  breakMode: BREAK_MODE_AUTOMATIC,
  focusMinutes: 25,
  breakMinutes: 5,
  debugFocusSeconds: "30",
  debugBreakSeconds: "10",
};

const minutesToMs = (minutes) => {
  const value = Number(minutes);
  return Number.isFinite(value) && value > 0 && value <= 300 ? Math.round(value * 60000) : null;
};

const integerMinutesToMsStrict = (minutes, min = 15, max = 180) => {
  if (minutes === "" || minutes === null || minutes === undefined) return null;
  const value = Number(minutes);
  return Number.isInteger(value) && value >= min && value <= max ? value * 60000 : null;
};

const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const ratingLabel = (question, value) => `${value}. ${question.anchors.find((anchor) => anchor.startsWith(`${value} =`)) || ""}`;
const msToMinutes = (milliseconds) => Math.round(milliseconds / 60000);
const msToSeconds = (milliseconds) => Math.round(milliseconds / 1000);
const focusMinuteOptions = getAllowedFocusDurations().map(msToMinutes);
const secondsToMsStrict = (seconds) => {
  if (seconds === "" || seconds === null || seconds === undefined) return null;
  const value = Number(seconds);
  return Number.isInteger(value) ? value * 1000 : null;
};

const targetSecondsToMsStrict = (seconds) => {
  const value = secondsToMsStrict(seconds);
  return value !== null && value >= 15000 && value <= 180000 ? value : null;
};

const formatDurationForMode = (milliseconds, isDebugMode) => (
  isDebugMode ? `${msToSeconds(milliseconds)} sec` : `${msToMinutes(milliseconds)} min`
);

const formatBreakPositions = (positions, isDebugMode) => {
  const values = positions.map((position) => formatDurationForMode(position, isDebugMode));
  if (values.length === 0) return "No planned break will be scheduled for this target duration.";
  if (values.length === 1) return `Break after ${values[0]} of focused study`;
  return `Breaks after ${values.slice(0, -1).join(", ")}, and ${values.at(-1)} of focused study`;
};

function SkipCheckInDialog({ open, onClose, onConfirm }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    cancelRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="skip-checkin-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl">
        <h2 id="skip-checkin-title" className="text-lg font-black">Skip the remaining check-in?</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          You can begin the study session without completing these optional questions. Missing answers will remain blank, so some historical insights may be less detailed.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button ref={cancelRef} type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800">
            Continue Check-in
          </button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">
            Skip and Start Session
          </button>
        </div>
      </section>
    </div>
  );
}

export default function SessionSetupForm() {
  const router = useRouter();
  const { prepareSession, activeSession } = useSession();
  const { isDebugMode } = useDebug();
  const [stage, setStage] = useState("welcome");
  const [optionalIndex, setOptionalIndex] = useState(0);
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(NAV_DIRECTION.FORWARD);
  const [transitionPhase, setTransitionPhase] = useState(TRANSITION_PHASE.IDLE);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const advanceTimerRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const pendingStepIdRef = useRef(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery?.matches === true);
    updatePreference();
    mediaQuery?.addEventListener?.("change", updatePreference);
    return () => mediaQuery?.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(advanceTimerRef.current);
    window.clearTimeout(transitionTimerRef.current);
  }, []);

  const isRegularBreakMode = draft.breakMode === BREAK_MODE_REGULAR;
  const selectedCustomTargetMs = isDebugMode
    ? targetSecondsToMsStrict(draft.customMinutes)
    : integerMinutesToMsStrict(draft.customMinutes);
  const selectedTargetMs = draft.targetChoice === "custom"
    ? selectedCustomTargetMs
    : minutesToMs(draft.targetChoice);
  const selectedFocusMs = minutesToMs(draft.focusMinutes);
  const selectedBreakMs = minutesToMs(draft.breakMinutes);
  const selectedDebugFocusMs = secondsToMsStrict(draft.debugFocusSeconds);
  const selectedDebugBreakMs = secondsToMsStrict(draft.debugBreakSeconds);
  const allowedBreakMinutes = getAllowedBreakDurations(selectedFocusMs).map(msToMinutes);
  const targetValidation = (() => {
    if (draft.targetChoice !== "custom") return "";
    if (isDebugMode && selectedCustomTargetMs === null) {
      return "Debug Target Duration must be a whole number from 15 to 180 seconds.";
    }
    if (!isDebugMode && selectedCustomTargetMs === null) {
      return "Target Duration must be a whole number from 15 to 180 minutes.";
    }
    return "";
  })();
  const debugBreakValidation = (() => {
    if (!isRegularBreakMode || !isDebugMode) return "";
    if (selectedDebugFocusMs === null || !isValidDebugBreakFocusDuration(selectedDebugFocusMs)) {
      return "Debug Focus Time must be a whole number from 15 to 600 seconds.";
    }
    if (selectedDebugBreakMs === null || !isValidDebugBreakDuration(selectedDebugBreakMs, selectedDebugFocusMs)) {
      return "Debug Break Time must be a whole number from 5 to 300 seconds and no more than one third of Focus Time.";
    }
    return "";
  })();
  const normalizedBreakPlan = normalizeSessionPlan(
    isRegularBreakMode
      ? isDebugMode && !debugBreakValidation
        ? {
          targetDurationMs: selectedTargetMs,
          focusDurationMs: selectedDebugFocusMs,
          breakDurationMs: selectedDebugBreakMs,
          timingMode: TIMING_MODE_DEBUG,
        }
        : {
        targetDurationMs: selectedTargetMs,
        focusDurationMs: selectedFocusMs,
        breakDurationMs: selectedBreakMs,
      }
      : {
        targetDurationMs: selectedTargetMs,
        ...(isDebugMode ? { timingMode: TIMING_MODE_DEBUG } : {}),
      },
    { targetDurationMs: selectedTargetMs }
  );
  const plannedBreakPositions = isRegularBreakMode && !debugBreakValidation ? calculatePlannedBreakPositions(normalizedBreakPlan) : [];
  const plannedBreakDurationMs = normalizedBreakPlan.breakDurationMs * normalizedBreakPlan.plannedBreakCount;
  const currentOptionalStep = optionalSteps[optionalIndex];
  const setupValid = draft.taskName.trim().length > 0 &&
    draft.taskName.trim().length <= 80 &&
    selectedTargetMs !== null &&
    !targetValidation &&
    !debugBreakValidation;

  const updateDraft = (updates) => {
    setDraft((previous) => ({ ...previous, ...updates }));
  };

  const updateCheckIn = (key, value) => {
    setDraft((previous) => ({
      ...previous,
      preSessionCheckIn: {
        ...previous.preSessionCheckIn,
        [key]: value,
      },
    }));
  };

  const updateFocusMinutes = (focusMinutes) => {
    const focusDurationMs = minutesToMs(focusMinutes);
    const safeBreakMinutes = msToMinutes(coerceBreakDurationForFocus(selectedBreakMs, focusDurationMs));
    updateDraft({ focusMinutes, breakMinutes: safeBreakMinutes });
  };

  const updateDebugFocusSeconds = (focusSeconds) => {
    const focusDurationMs = secondsToMsStrict(focusSeconds);
    const breakDurationMs = secondsToMsStrict(draft.debugBreakSeconds);
    const updates = { debugFocusSeconds: focusSeconds };
    if (isValidDebugBreakFocusDuration(focusDurationMs) && breakDurationMs !== null) {
      const safeBreakSeconds = msToSeconds(coerceDebugBreakDurationForFocus(breakDurationMs, focusDurationMs));
      if (safeBreakSeconds < Number(draft.debugBreakSeconds)) {
        updates.debugBreakSeconds = String(safeBreakSeconds);
      }
    }
    updateDraft(updates);
  };

  const cancelPendingAdvance = () => {
    window.clearTimeout(advanceTimerRef.current);
    pendingStepIdRef.current = null;
  };

  const navigateOptional = (direction) => {
    if (isAdvancing) return;
    cancelPendingAdvance();
    setIsAdvancing(true);
    setTransitionDirection(direction);
    setTransitionPhase(TRANSITION_PHASE.EXITING);
    const transitionMs = prefersReducedMotion ? REDUCED_MOTION_TRANSITION_MS : QUESTION_TRANSITION_MS;
    window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      if (direction === NAV_DIRECTION.BACKWARD) {
        if (optionalIndex === 0) {
          setStage("setup");
        } else {
          setOptionalIndex((previous) => Math.max(0, previous - 1));
        }
      } else if (optionalIndex >= optionalSteps.length - 1) {
        setStage("ready");
      } else {
        setOptionalIndex((previous) => Math.min(optionalSteps.length - 1, previous + 1));
      }
      setTransitionPhase(TRANSITION_PHASE.ENTERING);
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = window.setTimeout(() => {
        setTransitionPhase(TRANSITION_PHASE.IDLE);
        setIsAdvancing(false);
      }, transitionMs);
    }, transitionMs);
  };

  const goToNextOptional = () => navigateOptional(NAV_DIRECTION.FORWARD);
  const goToPreviousOptional = () => navigateOptional(NAV_DIRECTION.BACKWARD);

  const scheduleAdvance = (stepId) => {
    window.clearTimeout(advanceTimerRef.current);
    pendingStepIdRef.current = stepId;
    advanceTimerRef.current = window.setTimeout(() => {
      if (pendingStepIdRef.current !== stepId || currentOptionalStep?.id !== stepId || isAdvancing) return;
      pendingStepIdRef.current = null;
      navigateOptional(NAV_DIRECTION.FORWARD);
    }, AUTO_ADVANCE_IDLE_MS);
  };

  const validateSetup = () => {
    if (!draft.taskName.trim()) return "Task Name is required.";
    if (draft.taskName.trim().length > 80) return "Task Name should be about 80 characters or less.";
    if (targetValidation) return targetValidation;
    if (selectedTargetMs === null) return isDebugMode
      ? "Choose a valid Target Duration."
      : "Choose a positive Target Duration.";
    if (debugBreakValidation) return debugBreakValidation;
    if (isRegularBreakMode && normalizedBreakPlan.breakDurationMs <= 0) return "Choose a valid Break Time for the selected Focus Time.";
    return "";
  };

  const beginOptionalFlow = () => {
    const validation = validateSetup();
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setStage("optional");
    setOptionalIndex(0);
    setTransitionPhase(TRANSITION_PHASE.IDLE);
  };

  const buildSessionInput = () => {
    const recordedAt = new Date().toISOString();
    return {
      taskName: draft.taskName.trim(),
      taskDescription: draft.taskName.trim(),
      targetDurationMs: selectedTargetMs,
      breakMode: draft.breakMode,
      sessionPlan: normalizedBreakPlan,
      subject: draft.subject,
      customSubject: draft.subject === "other" ? draft.customSubject.trim() || null : null,
      taskType: draft.taskType,
      customTaskType: draft.taskType === "other" ? draft.customTaskType.trim() || null : null,
      sessionGoal: draft.sessionGoal.trim() || null,
      preSessionCheckIn: {
        ...draft.preSessionCheckIn,
        recordedAt,
      },
    };
  };

  const startStudySession = async () => {
    const validation = validateSetup();
    if (validation) {
      setStage("setup");
      setError(validation);
      return;
    }

    setIsStarting(true);
    cancelPendingAdvance();
    setError("");
    try {
      if (activeSession) {
        router.push("/app");
        return;
      }
      await prepareSession(buildSessionInput());
      setDraft(initialDraft);
      router.push("/app");
    } catch (startError) {
      console.error("Failed to prepare study session:", startError);
      setError("Could not prepare the study session. Please try again.");
    } finally {
      setIsStarting(false);
      setIsSkipDialogOpen(false);
    }
  };

  const handleChoice = (step, value) => {
    if (step.id === "subject") {
      updateDraft({ subject: value, customSubject: value === "other" ? draft.customSubject : "" });
      if (isSingleChoiceAutoAdvanceStep(step, value)) scheduleAdvance(step.id);
    } else {
      updateDraft({ taskType: value, customTaskType: value === "other" ? draft.customTaskType : "" });
      if (isSingleChoiceAutoAdvanceStep(step, value)) scheduleAdvance(step.id);
    }
  };

  const renderSetup = () => (
    <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 shadow-2xl backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Session Setup</p>
      <h1 className="mt-3 text-2xl font-black text-white">Set up your study session.</h1>
      <p className="mt-2 text-sm text-slate-400">Task Name and Target Duration are required. The session timer will not start yet.</p>

      <div className="mt-7 space-y-6">
        <label className="block">
          <span className="text-sm font-bold text-white">Task Name</span>
          <input
            type="text"
            maxLength={80}
            value={draft.taskName}
            onChange={(event) => updateDraft({ taskName: event.target.value })}
            placeholder="SAT Reading Practice"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:border-cyan-400/50"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-bold text-white">Target Duration</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {targetOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => updateDraft({ targetChoice: option.value })}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-all ${draft.targetChoice === option.value ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-cyan-400/40"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {draft.targetChoice === "custom" && (
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-400">
                {isDebugMode ? "Custom seconds" : "Custom minutes"}
              </span>
              <input
                type="number"
                min={isDebugMode ? "15" : "15"}
                max={isDebugMode ? "180" : "180"}
                step="1"
                value={draft.customMinutes}
                onChange={(event) => updateDraft({ customMinutes: event.target.value })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                {isDebugMode ? "Debug custom targets use 15-180 seconds." : "Custom targets use 15-180 minutes."}
              </span>
            </label>
          )}
          {targetValidation && <p className="mt-2 text-sm font-semibold text-red-300">{targetValidation}</p>}
        </fieldset>

        <fieldset className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <legend className="text-sm font-bold text-white">Break Settings</legend>
          <div className="mt-3 grid grid-cols-1 gap-3">
            {[
              [BREAK_MODE_AUTOMATIC, "Automatic Break Suggestions", "Receive progressively stronger break reminders during longer study sessions."],
              [BREAK_MODE_REGULAR, "Plan Regular Breaks", "Follow a custom focus-and-break schedule."],
            ].map(([value, title, description]) => {
              const selected = draft.breakMode === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-all ${selected ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-slate-950/40 hover:border-cyan-400/40"}`}
                >
                  <input
                    type="radio"
                    name="breakMode"
                    value={value}
                    checked={selected}
                    onChange={() => updateDraft({ breakMode: value })}
                    className="mt-1 h-4 w-4 border-white/20 bg-slate-950 text-cyan-400 focus:ring-2 focus:ring-cyan-300"
                  />
                  <span>
                    <span className="block text-sm font-bold text-white">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {isRegularBreakMode && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {isDebugMode ? (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-400">Focus time</span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min="15"
                        max="600"
                        step="1"
                        value={draft.debugFocusSeconds}
                        onChange={(event) => updateDebugFocusSeconds(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                      />
                      <span className="text-xs font-semibold text-slate-400">seconds</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-400">Break time</span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="300"
                        step="1"
                        value={draft.debugBreakSeconds}
                        onChange={(event) => updateDraft({ debugBreakSeconds: event.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                      />
                      <span className="text-xs font-semibold text-slate-400">seconds</span>
                    </div>
                    <span className="mt-1 block text-[11px] text-slate-500">Debug Break time cannot exceed one third of Debug Focus time.</span>
                  </label>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-400">Focus time</span>
                    <select
                      value={draft.focusMinutes}
                      onChange={(event) => updateFocusMinutes(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                    >
                      {focusMinuteOptions.map((minutes) => (
                        <option key={minutes} value={minutes}>{minutes} minutes</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-400">Break time</span>
                    <select
                      value={draft.breakMinutes}
                      onChange={(event) => updateDraft({ breakMinutes: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                    >
                      {allowedBreakMinutes.map((minutes) => (
                        <option key={minutes} value={minutes}>{minutes} minutes</option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-slate-500">Break time cannot exceed one third of Focus time.</span>
                  </label>
                </>
              )}
              {debugBreakValidation && (
                <p className="sm:col-span-2 text-sm font-semibold text-red-300">{debugBreakValidation}</p>
              )}
              <div className="sm:col-span-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-3">
                <p className="text-xs font-bold text-cyan-100">
                  {selectedTargetMs && !debugBreakValidation
                    ? `${msToMinutes(selectedTargetMs)} min study + ${formatDurationForMode(plannedBreakDurationMs, isDebugMode)} planned breaks`
                    : "Choose valid durations to preview breaks"}
                </p>
                <p className="mt-1 text-xs text-slate-300">{formatBreakPositions(plannedBreakPositions, isDebugMode)}</p>
              </div>
            </div>
          )}
        </fieldset>

        {error && <p className="text-sm font-semibold text-red-300">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setStage("welcome")} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800">
            Back
          </button>
          <button type="button" onClick={beginOptionalFlow} disabled={!setupValid} className="flex-1 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
            Next
          </button>
        </div>
      </div>
    </section>
  );

  const renderOptional = () => {
    const step = currentOptionalStep;
    const transitionClass = getQuestionTransitionClass({
      direction: transitionDirection,
      phase: transitionPhase,
      reducedMotion: prefersReducedMotion,
    });
    const progress = `Optional check-in · ${optionalIndex + 1} of ${optionalSteps.length}`;
    return (
      <section className="relative rounded-3xl border border-white/10 bg-slate-950/55 p-6 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          aria-label="Previous question"
          onClick={goToPreviousOptional}
          disabled={isAdvancing || isStarting || isSkipDialogOpen}
          className={`${getCircularNavButtonClass({ theme: "cyan" })} left-2 sm:-left-5`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Next question"
          onClick={goToNextOptional}
          disabled={isAdvancing || isStarting || isSkipDialogOpen}
          className={`${getCircularNavButtonClass({ theme: "cyan" })} right-2 sm:-right-5`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={`px-9 sm:px-10 ${transitionClass}`}>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Theory-informed session check-in and reflection</p>
        <p className="mt-3 text-xs text-slate-500">Optional - your answers can help you better understand your learning patterns over time.</p>
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-500" aria-live="polite">{progress}</p>
        <h1 className="mt-5 text-xl font-black text-white">{step.question}</h1>

        <div className="mt-6">
          {step.type === "choice" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {step.options.map(([value, label]) => {
                  const selected = draft[step.id] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isAdvancing}
                      onClick={() => handleChoice(step, value)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all ${selected ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-cyan-400/40"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {draft[step.id] === "other" && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">Custom response</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={step.id === "subject" ? draft.customSubject : draft.customTaskType}
                    onChange={(event) => updateDraft(step.id === "subject" ? { customSubject: event.target.value } : { customTaskType: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                  />
                </label>
              )}
            </div>
          )}

          {step.type === "text" && (
            <label className="block">
              <span className="sr-only">{step.question}</span>
              <textarea
                value={draft.sessionGoal}
                maxLength={300}
                onChange={(event) => updateDraft({ sessionGoal: event.target.value })}
                placeholder={step.placeholder}
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:border-cyan-400/50"
              />
              <span className="mt-1 block text-right text-[10px] text-slate-500">{draft.sessionGoal.length}/300</span>
            </label>
          )}

          {step.type === "rating" && (
            <fieldset>
              <legend className="sr-only">{step.question}</legend>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => {
                  const selected = draft.preSessionCheckIn[step.id] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isAdvancing}
                      aria-label={ratingLabel(step, value)}
                      onClick={() => {
                        updateCheckIn(step.id, value);
                        scheduleAdvance(step.id);
                      }}
                      className={`rounded-xl border px-3 py-4 text-lg font-black transition-all ${selected ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-cyan-400/40"}`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                {step.anchors.map((anchor) => <span key={anchor}>{anchor}</span>)}
              </div>
            </fieldset>
          )}
        </div>

        </div>

        <div className="mt-7 flex justify-end px-9 sm:px-10">
          <button
            type="button"
            onClick={() => {
              cancelPendingAdvance();
              setIsSkipDialogOpen(true);
            }}
            disabled={isAdvancing || isStarting}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 transition-all hover:bg-white/5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      </section>
    );
  };

  const readySummary = [
    ["Task", draft.taskName.trim() || "Not provided"],
    ["Target duration", selectedTargetMs
      ? isDebugMode && draft.targetChoice === "custom"
        ? `${Math.round(selectedTargetMs / 1000)} seconds`
        : `${Math.round(selectedTargetMs / 60000)} minutes`
      : "Not provided"],
    ["Break settings", isRegularBreakMode
      ? isDebugMode
        ? `Plan Regular Breaks - ${draft.debugFocusSeconds} sec focus / ${draft.debugBreakSeconds} sec break`
        : `Plan Regular Breaks - ${draft.focusMinutes} min focus / ${draft.breakMinutes} min break`
      : "Automatic Break Suggestions"],
    ...(draft.sessionGoal.trim() ? [["Goal", draft.sessionGoal.trim()]] : []),
  ];

  if (stage === "welcome") {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-8 text-center shadow-2xl backdrop-blur-xl motion-safe:transition-all motion-safe:duration-300">
        <p className="text-2xl font-black text-white sm:text-3xl">{greetingForNow()},</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Welcome to your study workspace.</h1>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setStage("setup")} className="rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300">
            Start a New Study Session
          </button>
          <button type="button" onClick={() => router.push("/app/dashboard")} className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 text-sm font-bold text-slate-100 transition-all hover:bg-slate-800">
            View Historical Analytics
          </button>
        </div>
      </section>
    );
  }

  if (stage === "setup") return renderSetup();
  if (stage === "optional") {
    return (
      <>
        {renderOptional()}
        <SkipCheckInDialog open={isSkipDialogOpen} onClose={() => setIsSkipDialogOpen(false)} onConfirm={() => void startStudySession()} />
      </>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 shadow-2xl backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Ready to begin?</p>
      <h1 className="mt-3 text-2xl font-black text-white">Start your study session when you are ready.</h1>
      <div className="mt-6 space-y-3">
        {readySummary.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
          </div>
        ))}
      </div>
      {error && <p className="mt-4 text-sm font-semibold text-red-300">{error}</p>}
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => setStage("optional")} disabled={isStarting} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-all hover:bg-slate-800 disabled:opacity-60">
          Back
        </button>
        <button type="button" onClick={() => void startStudySession()} disabled={isStarting} className="flex-1 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-70">
          {isStarting ? "Preparing session..." : "Start Study Session"}
        </button>
      </div>
    </section>
  );
}
