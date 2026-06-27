"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

type Phase = "idle" | "listening" | "processing" | "speaking" | "error";

interface Translation {
  german: string;
  literal: string;
  pronunciation: string;
}

export default function VoiceTutor() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [english, setEnglish] = useState("");
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [repeatMode, setRepeatMode] = useState(false);

  const repeatModeRef = useRef(false);
  const hasRepeatedRef = useRef(false);
  const currentGermanRef = useRef("");

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
      setEnglish(transcript);
      setPhase("processing");

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: transcript }),
        });

        if (!res.ok) throw new Error("Translation failed");

        const data: Translation = await res.json();
        setTranslation(data);
        currentGermanRef.current = data.german;
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
    [speak]
  );

  const handleError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setPhase("error");
  }, []);

  const { start, stop, restart } = useSpeechRecognition({
    onResult: handleTranscript,
    onError: handleError,
  });

  const handleStart = useCallback(() => {
    setPhase("listening");
    setEnglish("");
    setTranslation(null);
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
    cancel();
    setPhase("idle");
  }, [stop, cancel]);

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
    listening: "Listening...",
    processing: "Translating...",
    speaking: "Speaking...",
    error: errorMsg || "Error",
  };

  const isActive = phase !== "idle";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 select-none">
      <h1 className="text-xl font-semibold tracking-wide text-gray-400 mb-12">
        German Voice Tutor
      </h1>

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
        {phase === "listening" ? "🎙️" : phase === "processing" ? "⏳" : phase === "speaking" ? "🔊" : "🎙️"}
      </button>

      {/* Status */}
      <p className="mt-6 text-sm text-gray-400 tracking-widest uppercase">
        {phaseLabel[phase]}
      </p>

      {/* English transcript */}
      {english && (
        <div className="mt-10 w-full max-w-md">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">You said</p>
          <p className="text-gray-300 text-lg">{english}</p>
        </div>
      )}

      {/* German translation */}
      {translation && (
        <div className="mt-6 w-full max-w-md">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">German</p>
          <p className="text-white text-2xl font-medium">{translation.german}</p>

          <button
            onClick={() => setShowDetails((v) => !v)}
            className="mt-3 text-xs text-gray-500 hover:text-gray-300 underline"
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>

          {showDetails && (
            <div className="mt-3 space-y-2 text-sm text-gray-400">
              <p>
                <span className="text-gray-500">Literal: </span>
                {translation.literal}
              </p>
              <p>
                <span className="text-gray-500">Pronunciation: </span>
                {translation.pronunciation}
              </p>
            </div>
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
