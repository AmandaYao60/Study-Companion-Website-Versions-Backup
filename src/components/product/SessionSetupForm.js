"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "../../context/AppContext";

const targetOptions = [
  { label: "25 min", value: 25 },
  { label: "45 min", value: 45 },
  { label: "60 min", value: 60 },
  { label: "Custom", value: "custom" },
];

const examples = ["SAT Reading Practice", "Review rotational motion", "Draft application essay"];
const minutesToMs = (minutes) => {
  const value = Number(minutes);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 60000) : null;
};

export default function SessionSetupForm() {
  const router = useRouter();
  const { startCamera, startSession, isCameraAllowed, isAiLoaded } = useAppState();
  const [taskDescription, setTaskDescription] = useState("");
  const [targetChoice, setTargetChoice] = useState(25);
  const [customMinutes, setCustomMinutes] = useState("");
  const [energy, setEnergy] = useState(null);
  const [mood, setMood] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  const selectedTargetMs = targetChoice === "custom" ? minutesToMs(customMinutes) : minutesToMs(targetChoice);

  const handleStart = async () => {
    const trimmedTask = taskDescription.trim();
    if (!trimmedTask) {
      setError("Add a study task before starting.");
      return;
    }

    setError("");
    setIsStarting(true);
    try {
      if (!isCameraAllowed) {
        await startCamera();
      }

      const session = await startSession({
        taskDescription: trimmedTask,
        targetDurationMs: selectedTargetMs,
        preSessionCheckIn: { energy, mood },
      });

      if (session) router.push("/app/study");
    } catch (startError) {
      console.error("Failed to start study session:", startError);
      setError("Camera permission is required to start a monitored study session.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xl">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Session setup</p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Good afternoon.</h1>
        <p className="mt-2 text-lg text-slate-300">What would you like to work on today?</p>
      </div>

      <div className="mt-8 space-y-6">
        <label className="block">
          <span className="text-sm font-bold text-white">What are you studying?</span>
          <input
            type="text"
            value={taskDescription}
            onChange={(event) => setTaskDescription(event.target.value)}
            placeholder="SAT Reading Practice"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:border-cyan-400/50"
          />
        </label>

        <div className="flex flex-wrap gap-2" aria-label="Study task examples">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => setTaskDescription(example)} className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:border-cyan-400/30 hover:text-cyan-200">
              {example}
            </button>
          ))}
        </div>

        <fieldset>
          <legend className="text-sm font-bold text-white">Target duration</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {targetOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setTargetChoice(option.value)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-all ${targetChoice === option.value ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:border-cyan-400/40"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {targetChoice === "custom" && (
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-400">Custom minutes</span>
              <input
                type="number"
                min="1"
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
              />
            </label>
          )}
        </fieldset>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <p className="text-sm font-bold text-white">Optional self-reported check-in</p>
          <p className="mt-1 text-xs text-slate-500">This is saved as your own pre-session note. It is not combined with model-inferred valence or arousal.</p>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">How is your energy right now?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["low", "moderate", "high"].map((value) => (
                <button key={value} type="button" onClick={() => setEnergy(energy === value ? null : value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${energy === value ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-slate-950 text-slate-300"}`}>
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">How are you feeling?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["negative", "neutral", "positive"].map((value) => (
                <button key={value} type="button" onClick={() => setMood(mood === value ? null : value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${mood === value ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-slate-950 text-slate-300"}`}>
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {error && <p className="text-sm font-semibold text-red-300">{error}</p>}

        <button type="button" onClick={() => void handleStart()} disabled={isStarting} className="w-full rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-black text-slate-950 transition-all hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-70">
          {isStarting ? (isAiLoaded ? "Starting session..." : "Preparing camera and local AI...") : "Start Study Session"}
        </button>
      </div>
    </section>
  );
}
