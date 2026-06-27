"use client";

import { useEffect, useRef, useCallback } from "react";

interface Options {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

// How long to wait after the last speech fragment before sending to AI
const SILENCE_MS = 1500;

export function useSpeechRecognition({ onResult, onError, lang = "en-US" }: Options) {
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const langRef = useRef(lang);

  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onErrorRef.current = onError; });
  useEffect(() => { langRef.current = lang; }, [lang]);

  const build = useCallback((): any | null => {
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onErrorRef.current?.("Speech recognition not supported. Use Chrome.");
      return null;
    }

    const r = new SR();
    r.lang = langRef.current;
    r.continuous = true;
    r.interimResults = false;

    let stopped = false;   // true when we intentionally stopped after getting a result
    let hadError = false;  // true on genuine errors so onend doesn't restart
    let accumulated = "";
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDebounce = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    };

    r.onresult = (event) => {
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
        if (transcript) {
          stopped = true;
          try { r.abort(); } catch { /* ignore */ }
          onResultRef.current(transcript);
        }
      }, SILENCE_MS);
    };

    r.onerror = (event) => {
      clearDebounce();
      accumulated = "";
      if (event.error === "aborted") return;
      if (event.error === "no-speech") return; // onend will restart
      hadError = true;
      onErrorRef.current?.(`Speech error: ${event.error}`);
    };

    r.onend = () => {
      if (stopped || hadError) return;
      if (recognitionRef.current !== r) return; // another instance already took over
      // Unexpected end (no-speech timeout, brief network blip) — restart transparently
      setTimeout(() => {
        if (recognitionRef.current !== r) return;
        const fresh = build();
        if (!fresh) return;
        recognitionRef.current = fresh;
        try { fresh.start(); } catch { /* ignore */ }
      }, 300);
    };

    return r;
  }, []);

  const start = useCallback(() => {
    const prev = recognitionRef.current;
    recognitionRef.current = null; // clear before abort so onend doesn't restart
    prev?.abort();
    const r = build();
    if (!r) return;
    recognitionRef.current = r;
    try { r.start(); } catch { /* ignore */ }
  }, [build]);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    recognitionRef.current = null;
    r?.abort();
  }, []);

  const restart = useCallback(() => {
    const r = recognitionRef.current;
    recognitionRef.current = null;
    r?.abort();
    setTimeout(() => {
      const fresh = build();
      if (!fresh) return;
      recognitionRef.current = fresh;
      try { fresh.start(); } catch { /* ignore */ }
    }, 300);
  }, [build]);

  useEffect(() => {
    return () => {
      const r = recognitionRef.current;
      recognitionRef.current = null;
      r?.abort();
    };
  }, []);

  return { start, stop, restart };
}
