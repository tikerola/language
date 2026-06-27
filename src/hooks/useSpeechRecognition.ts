"use client";

import { useEffect, useRef, useCallback } from "react";

interface Options {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
}

export function useSpeechRecognition({ onResult, onError }: Options) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  // Keep refs current without recreating recognition on every render
  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onErrorRef.current = onError; });

  const build = useCallback((): SpeechRecognition | null => {
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onErrorRef.current?.("Speech recognition not supported. Use Chrome.");
      return null;
    }
    const r: SpeechRecognition = new SR();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onResultRef.current(transcript);
    };
    r.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      onErrorRef.current?.(`Speech error: ${event.error}`);
    };
    return r;
  }, []);

  const start = useCallback(() => {
    recognitionRef.current?.abort();
    const r = build();
    if (!r) return;
    recognitionRef.current = r;
    try { r.start(); } catch { /* ignore */ }
  }, [build]);

  const stop = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  const restart = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setTimeout(() => {
      const r = build();
      if (!r) return;
      recognitionRef.current = r;
      try { r.start(); } catch { /* ignore */ }
    }, 300);
  }, [build]);

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  return { start, stop, restart };
}
