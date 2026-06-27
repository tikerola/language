"use client";

import { useEffect, useRef, useCallback } from "react";

interface Options {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

const SILENCE_MS = 1500;
// How long to suppress results after TTS ends — long enough for Android echoes to clear
const RESUME_DELAY_MS = 2000;

// Returns true if transcript looks like an echo of the TTS output
function isEcho(transcript: string, ttsText: string): boolean {
  if (!ttsText) return false;
  const a = transcript.toLowerCase().split(/\s+/);
  const b = new Set(ttsText.toLowerCase().split(/\s+/));
  const overlap = a.filter((w) => b.has(w)).length;
  return overlap / a.length > 0.6;
}

export function useSpeechRecognition({ onResult, onError, lang = "en-US" }: Options) {
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const langRef = useRef(lang);

  // Whether we should act on incoming speech (false while processing/speaking)
  const activeRef = useRef(false);
  // Whether the recognition session is currently alive
  const runningRef = useRef(false);
  // Last TTS output — used to detect and discard microphone echo
  const echoTextRef = useRef("");

  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onErrorRef.current = onError; });
  useEffect(() => { langRef.current = lang; }, [lang]);

  const build = useCallback((): any | null => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onErrorRef.current?.("Speech recognition not supported. Use Chrome.");
      return null;
    }

    const r = new SR();
    r.lang = langRef.current;
    r.continuous = true;
    r.interimResults = false;

    let accumulated = "";
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDebounce = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    };

    r.onresult = (event: any) => {
      if (!activeRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const t = event.results[i][0].transcript.trim();
          if (t) accumulated += (accumulated ? " " : "") + t;
        }
      }

      if (!accumulated) return;

      clearDebounce();
      debounceTimer = setTimeout(() => {
        const transcript = accumulated.trim();
        accumulated = "";
        debounceTimer = null;
        if (!transcript || !activeRef.current) return;

        // Drop silent echoes of our own TTS output
        if (isEcho(transcript, echoTextRef.current)) return;

        activeRef.current = false;
        onResultRef.current(transcript);
      }, SILENCE_MS);
    };

    r.onerror = (event: any) => {
      clearDebounce();
      accumulated = "";
      if (event.error === "aborted") return;
      if (event.error === "no-speech") return; // onend will restart if needed
      runningRef.current = false;
      onErrorRef.current?.(`Speech error: ${event.error}`);
    };

    r.onend = () => {
      runningRef.current = false;
      if (recognitionRef.current !== r) return;
      if (!activeRef.current) return; // paused intentionally, don't restart
      // Unexpected end while listening — restart transparently
      setTimeout(() => {
        if (recognitionRef.current !== r || !activeRef.current) return;
        const fresh = build();
        if (!fresh) return;
        recognitionRef.current = fresh;
        runningRef.current = true;
        try { fresh.start(); } catch { runningRef.current = false; }
      }, 300);
    };

    return r;
  }, []);

  const start = useCallback(() => {
    echoTextRef.current = "";
    const prev = recognitionRef.current;
    recognitionRef.current = null;
    runningRef.current = false;
    prev?.abort();

    const r = build();
    if (!r) return;
    recognitionRef.current = r;
    activeRef.current = true;
    runningRef.current = true;
    try { r.start(); } catch { runningRef.current = false; }
  }, [build]);

  const stop = useCallback(() => {
    echoTextRef.current = "";
    activeRef.current = false;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    runningRef.current = false;
    r?.abort();
  }, []);

  const restart = useCallback(() => {
    const delay = RESUME_DELAY_MS;
    if (runningRef.current && recognitionRef.current) {
      // Session alive — just re-enable after echo window
      setTimeout(() => { activeRef.current = true; }, delay);
      return;
    }
    // Session died while paused — start a fresh one after echo window
    setTimeout(() => {
      const fresh = build();
      if (!fresh) return;
      recognitionRef.current = fresh;
      activeRef.current = true;
      runningRef.current = true;
      try { fresh.start(); } catch { runningRef.current = false; }
    }, delay);
  }, [build]);

  // Called by the component after TTS speaks, so we know what to treat as echo
  const setEcho = useCallback((text: string) => {
    echoTextRef.current = text;
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      const r = recognitionRef.current;
      recognitionRef.current = null;
      r?.abort();
    };
  }, []);

  return { start, stop, restart, setEcho };
}
