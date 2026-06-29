"use client";

import { useEffect, useRef, useCallback } from "react";

interface Options {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  onAudioStart?: () => void;
  lang?: string;
  silenceMs?: number;
  resumeDelayMs?: number;
}

const DEFAULT_SILENCE_MS = 1500;
const DEFAULT_RESUME_DELAY_MS = 2000;

function isEcho(transcript: string, ttsText: string): boolean {
  if (!ttsText) return false;
  const a = transcript.toLowerCase().split(/\s+/);
  const b = new Set(ttsText.toLowerCase().split(/\s+/));
  const overlap = a.filter((w) => b.has(w)).length;
  return overlap / a.length > 0.6;
}

export function useSpeechRecognition({ onResult, onError, onAudioStart, lang = "en-US", silenceMs, resumeDelayMs }: Options) {
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onAudioStartRef = useRef(onAudioStart);
  const langRef = useRef(lang);
  const silenceMsRef = useRef(silenceMs ?? DEFAULT_SILENCE_MS);
  const resumeDelayMsRef = useRef(resumeDelayMs ?? DEFAULT_RESUME_DELAY_MS);

  const activeRef = useRef(false);
  const runningRef = useRef(false);
  const echoTextRef = useRef("");

  useEffect(() => { onResultRef.current = onResult; });
  useEffect(() => { onErrorRef.current = onError; });
  useEffect(() => { onAudioStartRef.current = onAudioStart; });
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { silenceMsRef.current = silenceMs ?? DEFAULT_SILENCE_MS; }, [silenceMs]);
  useEffect(() => { resumeDelayMsRef.current = resumeDelayMs ?? DEFAULT_RESUME_DELAY_MS; }, [resumeDelayMs]);

  const build = useCallback((): any | null => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onErrorRef.current?.("Speech recognition not supported. Use Chrome.");
      return null;
    }

    const r = new SR();
    r.lang = langRef.current;
    r.continuous = true;
    r.interimResults = true;

    // finalMap stores the latest transcript per result index so that Android's
    // progressive isFinal updates (resultIndex=0 each time, growing text) overwrite
    // instead of appending. accumulated is rebuilt from the map on each event.
    const finalMap = new Map<number, string>();
    let accumulated = "";
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hadFinalResult = false;

    const clearDebounce = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    };

    const scheduleSubmit = () => {
      clearDebounce();
      debounceTimer = setTimeout(() => {
        const transcript = accumulated.trim();
        accumulated = "";
        finalMap.clear();
        debounceTimer = null;
        if (!transcript || !activeRef.current) return;

        if (isEcho(transcript, echoTextRef.current)) return;

        activeRef.current = false;
        onResultRef.current(transcript);
      }, silenceMsRef.current);
    };

    r.onresult = (event: any) => {
      if (!activeRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          hadFinalResult = true;
          const t = event.results[i][0].transcript.trim();
          if (t) finalMap.set(i, t);
          else finalMap.delete(i);
        }
      }

      // Rebuild accumulated from the map so that an updated final result at the
      // same index overwrites the previous value instead of appending to it.
      const keys = [...finalMap.keys()].sort((a, b) => a - b);
      accumulated = keys.map(k => finalMap.get(k)!).join(" ");

      if (accumulated) {
        scheduleSubmit();
      } else {
        clearDebounce();
      }
    };

    r.onaudiostart = () => { onAudioStartRef.current?.(); };

    r.onerror = (event: any) => {
      clearDebounce();
      accumulated = "";
      finalMap.clear();
      if (event.error === "aborted") return;
      if (event.error === "no-speech") return;
      runningRef.current = false;
      onErrorRef.current?.(`Speech error: ${event.error}`);
    };

    r.onend = () => {
      runningRef.current = false;
      if (recognitionRef.current !== r) return;
      if (!activeRef.current) return;
      // If a final result was captured, wait past the debounce window so the
      // debounce fires first and sets activeRef.current = false. This prevents
      // Android from replaying buffered audio into the new session.
      // If no result was captured (silence timeout), restart quickly.
      const delay = hadFinalResult ? silenceMsRef.current + 200 : 300;
      setTimeout(() => {
        if (recognitionRef.current !== r || !activeRef.current) return;
        const fresh = build();
        if (!fresh) return;
        recognitionRef.current = fresh;
        runningRef.current = true;
        try { fresh.start(); } catch { runningRef.current = false; }
      }, delay);
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
    const prev = recognitionRef.current;
    recognitionRef.current = null;
    runningRef.current = false;
    prev?.abort();

    setTimeout(() => {
      const fresh = build();
      if (!fresh) return;
      recognitionRef.current = fresh;
      activeRef.current = true;
      runningRef.current = true;
      try { fresh.start(); } catch { runningRef.current = false; }
    }, resumeDelayMsRef.current);
  }, [build]);

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
