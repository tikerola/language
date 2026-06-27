"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

type Phase = "idle" | "listening" | "processing" | "speaking" | "error";
type Mode = "english" | "german" | "discussion";

type Result =
  | { mode: "english"; german: string; literal: string; pronunciation: string }
  | { mode: "german"; german: string; note: string }
  | { mode: "discussion"; german: string };

const MODE_LANG: Record<Mode, string> = {
  english: "en-US",
  german: "de-DE",
  discussion: "de-DE",
};

export default function VoiceTutor() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("english");
  const [spoken, setSpoken] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [repeatMode, setRepeatMode] = useState(false);

  const repeatModeRef = useRef(false);
  const hasRepeatedRef = useRef(false);
  const currentGermanRef = useRef("");
  const lastDiscussionReplyRef = useRef("");

  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  const handleTTSEnd = useCallback(() => {
    if (repeatModeRef.current && !hasRepeatedRef.current) {
      hasRepeatedRef.current = true;
      setTimeout(() => speak(currentGermanRef.current), 2000);
    } else {
      hasRepeatedRef.current = false;
      setPhase("listening");
      restart();
    }
  }, []);

  const { speak, cancel } = useSpeechSynthesis({ onEnd: handleTTSEnd });

  const handleTranscript = useCallback(
    async (transcript: string) => {
      setSpoken(transcript);
      setPhase("processing");

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: transcript,
            mode,
            ...(mode === "discussion" && lastDiscussionReplyRef.current
              ? { context: lastDiscussionReplyRef.current }
              : {}),
          }),
        });

        if (!res.ok) throw new Error("Translation failed");

        const data = await res.json();
        const tagged: Result = { ...data, mode };
        setResult(tagged);
        currentGermanRef.current = data.german;
        if (mode === "discussion") lastDiscussionReplyRef.current = data.german;
        hasRepeatedRef.current = false;
        setPhase("speaking");
        speak(data.german);
      } catch {
        setErrorMsg("Translation failed. Listening again...");
        setPhase("error");
        setTimeout(() => {
          setPhase("listening");
          restart();
        }, 2000);
      }
    },
    [speak, mode]
  );

  const handleError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setPhase("error");
  }, []);

  const { start, stop, restart } = useSpeechRecognition({
    onResult: handleTranscript,
    onError: handleError,
    lang: MODE_LANG[mode],
  });

  const handleStart = useCallback(() => {
    setPhase("listening");
    setSpoken("");
    setResult(null);
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
    cancel();
    setPhase("idle");
  }, [stop, cancel]);

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (phase !== "idle") {
        stop();
        cancel();
        setPhase("idle");
      }
      setMode(next);
      setSpoken("");
      setResult(null);
      lastDiscussionReplyRef.current = "";
    },
    [phase, stop, cancel]
  );

  // Space bar to start/stop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        if (phase === "idle" || phase === "error") handleStart();
        else handleStop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, handleStart, handleStop]);

  const phaseLabel: Record<Phase, string> = {
    idle: "Press Start or Space",
    listening: mode === "english" ? "Listening..." : "Listening... (speak German)",
    processing: mode === "english" ? "Translating..." : mode === "german" ? "Checking..." : "Thinking...",
    speaking: "Speaking...",
    error: errorMsg || "Error",
  };

  const isActive = phase !== "idle";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 select-none">
      <h1 className="text-xl font-semibold tracking-wide text-gray-400 mb-8">
        German Voice Tutor
      </h1>

      {/* Mode selector */}
      <div className="flex gap-2 mb-10">
        {([
          ["english", "EN → DE"],
          ["german", "DE correction"],
          ["discussion", "DE chat"],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors
              ${mode === m
                ? "bg-white text-gray-900"
                : "bg-gray-800 text-gray-400 hover:text-gray-200"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mic button */}
      <button
        onClick={isActive ? handleStop : handleStart}
        className={`w-24 h-24 rounded-full text-3xl transition-all duration-200 focus:outline-none
          ${phase === "listening" ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/40" : ""}
          ${phase === "processing" ? "bg-yellow-500 shadow-lg shadow-yellow-500/40" : ""}
          ${phase === "speaking" ? "bg-blue-500 shadow-lg shadow-blue-500/40" : ""}
          ${phase === "idle" ? "bg-gray-700 hover:bg-gray-600" : ""}
          ${phase === "error" ? "bg-gray-700" : ""}
        `}
      >
        {phase === "processing" ? "⏳" : phase === "speaking" ? "🔊" : "🎙️"}
      </button>

      {/* Status */}
      <p className="mt-6 text-sm text-gray-400 tracking-widest uppercase">
        {phaseLabel[phase]}
      </p>

      {/* Transcript */}
      {spoken && (
        <div className="mt-10 w-full max-w-md">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">You said</p>
          <p className="text-gray-300 text-lg">{spoken}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 w-full max-w-md">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            {result.mode === "discussion" ? "Reply" : result.mode === "german" && result.note ? "Correction" : "German"}
          </p>
          <p className="text-white text-2xl font-medium">{result.german}</p>

          {result.mode === "english" && (
            <>
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="mt-3 text-xs text-gray-500 hover:text-gray-300 underline"
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
              {showDetails && (
                <div className="mt-3 space-y-2 text-sm text-gray-400">
                  <p><span className="text-gray-500">Literal: </span>{result.literal}</p>
                  <p><span className="text-gray-500">Pronunciation: </span>{result.pronunciation}</p>
                </div>
              )}
            </>
          )}

          {result.mode === "german" && result.note && (
            <p className="mt-3 text-sm text-gray-400">
              <span className="text-gray-500">Note: </span>{result.note}
            </p>
          )}
        </div>
      )}

      {/* Repeat mode toggle */}
      <button
        onClick={() => setRepeatMode((v) => !v)}
        className={`mt-12 px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors
          ${repeatMode
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-500 hover:text-gray-300"
          }`}
      >
        Repeat ×2
      </button>

      <p className="mt-4 text-xs text-gray-700">Space to start / stop</p>
    </div>
  );
}
