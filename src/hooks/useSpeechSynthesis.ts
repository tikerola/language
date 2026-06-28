"use client";

import { useCallback, useRef } from "react";

interface Options {
  onEnd?: () => void;
}

export function useSpeechSynthesis({ onEnd }: Options = {}) {
  const deVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const loadDeVoice = useCallback(() => {
    if (deVoiceRef.current) return deVoiceRef.current;
    const voices = window.speechSynthesis.getVoices();
    const german =
      voices.find((v) => v.lang === "de-DE" && v.localService) ||
      voices.find((v) => v.lang.startsWith("de")) ||
      null;
    deVoiceRef.current = german;
    return german;
  }, []);

  const speak = useCallback(
    (text: string, rate = 1.0, lang = "de-DE") => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;

      if (lang.startsWith("de")) {
        const voice = loadDeVoice();
        if (voice) utterance.voice = voice;
      }

      utterance.onend = () => onEnd?.();
      utterance.onerror = () => onEnd?.();

      window.speechSynthesis.speak(utterance);
    },
    [loadDeVoice, onEnd]
  );

  const cancel = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return { speak, cancel };
}
