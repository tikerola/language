"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

type Phase = "idle" | "listening" | "processing" | "speaking" | "error";
type Mode = "english" | "german" | "discussion" | "vocabulary";

type Result =
  | { mode: "english"; german: string; literal: string; pronunciation: string }
  | { mode: "german"; german: string; note: string }
  | { mode: "discussion"; german: string }
  | { mode: "vocabulary"; word: string; correct: boolean | null };

const MODE_LANG: Record<Mode, string> = {
  english: "fi-FI",
  german: "de-DE",
  discussion: "de-DE",
  vocabulary: "fi-FI",
};

export default function VoiceTutor() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("english");
  const [spoken, setSpoken] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [repeatMode, setRepeatMode] = useState(false);
  const [vocabPhase, setVocabPhase] = useState<"topic" | "answer">("topic");

  const repeatModeRef = useRef(false);
  const hasRepeatedRef = useRef(false);
  const currentGermanRef = useRef("");
  const lastDiscussionReplyRef = useRef("");
  const vocabTopicRef = useRef("");
  const vocabWordRef = useRef("");
  const vocabUsedWordsRef = useRef<string[]>([]);

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

      if (mode === "vocabulary") {
        try {
          const isTopicPhase = !vocabTopicRef.current;
          let bodyData: Record<string, string>;

          if (isTopicPhase) {
            vocabTopicRef.current = transcript;
            vocabUsedWordsRef.current = [];
            bodyData = { mode: "vocabulary", topic: transcript };
          } else {
            bodyData = {
              mode: "vocabulary",
              topic: vocabTopicRef.current,
              word: vocabWordRef.current,
              answer: transcript,
              usedWords: vocabUsedWordsRef.current.join(","),
            };
          }

          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyData),
          });

          if (!res.ok) throw new Error("Failed");
          const data = await res.json();

          vocabWordRef.current = data.word;
          vocabUsedWordsRef.current = [...vocabUsedWordsRef.current, data.word];
          setVocabPhase("answer");
          setResult({
            mode: "vocabulary",
            word: data.word,
            correct: isTopicPhase ? null : data.correct ?? null,
          });
          currentGermanRef.current = data.tts;
          hasRepeatedRef.current = false;
          setEcho(data.tts);
          setPhase("speaking");
          speak(data.tts);
        } catch {
          setErrorMsg("Error. Listening again...");
          setPhase("error");
          setTimeout(() => {
            setPhase("listening");
            restart();
          }, 2000);
        }
        return;
      }

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
        setEcho(data.german);
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

  // Vocabulary switches recognition language: Finnish for topic input, German for answers
  const recogLang =
    mode === "vocabulary"
      ? vocabPhase === "topic" ? "fi-FI" : "de-DE"
      : MODE_LANG[mode];

  // Vocabulary: short silence (single word) and short resume (no long pause needed on PC)
  const silenceMs = mode === "vocabulary" ? 500 : 1500;
  const resumeDelayMs = mode === "vocabulary" ? 300 : 2000;

  const { start, stop, restart, setEcho } = useSpeechRecognition({
    onResult: handleTranscript,
    onError: handleError,
    lang: recogLang,
    silenceMs,
    resumeDelayMs,
  });

  const handleStart = useCallback(() => {
    setSpoken("");
    setResult(null);
    if (mode === "vocabulary") {
      setVocabPhase("topic");
      vocabTopicRef.current = "";
      vocabWordRef.current = "";
      vocabUsedWordsRef.current = [];
      setPhase("speaking");
      // Speak intro; recognition starts after TTS ends via handleTTSEnd → restart()
      speak("Welches Thema möchtest du wählen? Sag es auf Finnisch");
    } else {
      setPhase("listening");
      start();
    }
  }, [start, speak, mode]);

  const handleStop = useCallback(() => {
    stop();
    cancel();
    setPhase("idle");
    if (mode === "vocabulary") {
      setVocabPhase("topic");
      vocabTopicRef.current = "";
      vocabWordRef.current = "";
      vocabUsedWordsRef.current = [];
    }
  }, [stop, cancel, mode]);

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
      setVocabPhase("topic");
      vocabTopicRef.current = "";
      vocabWordRef.current = "";
      vocabUsedWordsRef.current = [];
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

  const listeningLabel =
    mode === "vocabulary"
      ? vocabPhase === "topic"
        ? "Listening... (say topic in Finnish)"
        : "Listening... (translate to German)"
      : mode === "english"
      ? "Listening... (speak Finnish)"
      : "Listening... (speak German)";

  const processingLabel =
    mode === "vocabulary"
      ? vocabTopicRef.current ? "Checking..." : "Getting first word..."
      : mode === "english" ? "Translating..."
      : mode === "german" ? "Checking..."
      : "Thinking...";

  const phaseLabel: Record<Phase, string> = {
    idle: "Press Start or Space",
    listening: listeningLabel,
    processing: processingLabel,
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
      <div className="flex flex-wrap gap-2 mb-10 justify-center">
        {([
          ["english", "FI → DE"],
          ["german", "DE correction"],
          ["discussion", "DE chat"],
          ["vocabulary", "Vocabulary"],
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

      {/* Result — translation / correction / discussion */}
      {result && result.mode !== "vocabulary" && (
        <div className="mt-6 w-full max-w-md">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            {result.mode === "discussion"
              ? "Reply"
              : result.mode === "german" && result.note
              ? "Correction"
              : "German"}
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

      {/* Result — vocabulary */}
      {result?.mode === "vocabulary" && (
        <div className="mt-6 w-full max-w-md">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Translate to German
          </p>
          <p className="text-white text-4xl font-bold tracking-wide">{result.word}</p>
          {result.correct !== null && (
            <p className={`mt-3 text-sm font-medium ${result.correct ? "text-green-400" : "text-red-400"}`}>
              {result.correct ? "Richtig!" : "Falsch"}
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
