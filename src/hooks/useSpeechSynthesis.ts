"use client";

import { useCallback, useRef } from "react";

interface Options {
  onEnd?: () => void;
}

export function useSpeechSynthesis({ onEnd }: Options = {}) {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const loadVoice = useCallback(() => {
    if (voiceRef.current) return voiceRef.current;
    const voices = window.speechSynthesis.getVoices();
    const german =
      voices.find((v) => v.lang === "de-DE" && v.localService) ||
      voices.find((v) => v.lang.startsWith("de")) ||
      null;
    voiceRef.current = german;
    return german;
  }, []);

  const speak = useCallback(
    (text: string, rate = 1.0) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "de-DE";
      utterance.rate = rate;

      const voice = loadVoice();
      if (voice) utterance.voice = voice;

      utterance.onend = () => onEnd?.();
      utterance.onerror = () => onEnd?.();

      window.speechSynthesis.speak(utterance);
    },
    [loadVoice, onEnd]
  );

  const cancel = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return { speak, cancel };
}
