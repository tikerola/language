"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

type Phase = "idle" | "listening" | "processing" | "speaking" | "error";
type Mode = "english" | "german" | "discussion" | "vocabulary" | "radio" | "story";
type VocabSubphase = "category" | "loading" | "learning" | "quiz" | "complete";
type StorySubphase = "input" | "loading" | "reading";

interface VocabWord {
  finnish: string;
  german: string;
  consecutiveCorrect: number;
  attempts: number;
  correctAttempts: number;
}

type Result =
  | { mode: "english"; german: string; literal: string; pronunciation: string }
  | { mode: "german"; german: string; note: string }
  | { mode: "discussion"; german: string };

const MODE_LANG: Record<Mode, string> = {
  english: "fi-FI",
  german: "de-DE",
  discussion: "de-DE",
  vocabulary: "de-DE",
  radio: "de-DE",
  story: "de-DE",
};

const RADIO_STATIONS = [
  {
    name: "Deutschlandfunk",
    desc: "Nachrichten · Kultur · Gespräche",
    url: "https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3",
  },
  {
    name: "WDR 5",
    desc: "Wissen · Gespräche · Kultur",
    url: "https://wdr-wdr5-live.icecastssl.wdr.de/wdr/wdr5/live/mp3/128/stream.mp3",
  },
  {
    name: "NDR Info",
    desc: "Nachrichten · Berichte",
    url: "https://icecast.ndr.de/ndr/ndrinfo/hamburg/mp3/128/stream.mp3",
  },
] as const;

const VOCAB_CATEGORIES = [
  { group: "Everyday", items: ["Food", "Drinks", "Fruits", "Vegetables", "Kitchen", "Home", "Furniture", "Clothing", "Bathroom", "Bedroom"] },
  { group: "Travel", items: ["Airport", "Hotel", "Restaurant", "Grocery Store", "Train Station", "Public Transport", "Directions", "Vacation"] },
  { group: "People", items: ["Family", "Friends", "Jobs", "Emotions", "Body Parts", "Health"] },
  { group: "Daily Life", items: ["School", "Work", "Technology", "Shopping", "Hobbies", "Sports"] },
  { group: "Nature", items: ["Animals", "Plants", "Weather", "Geography"] },
  { group: "Grammar", items: ["Common Verbs", "Modal Verbs", "Adjectives", "Adverbs", "Prepositions", "Question Words", "Conjunctions", "Separable Verbs"] },
  { group: "Conversation", items: ["Greetings", "Polite Expressions", "Small Talk", "Ordering Food", "Emergencies"] },
  { group: "Frequency", items: ["Top 100 Nouns", "Top 100 Verbs", "Top 100 Adjectives", "Top 100 Adverbs", "Top 100 Everyday Phrases"] },
];

interface TTSItem {
  text: string;
  delay: number;
  lang?: string;
  onSpeak?: () => void;
}

interface StoryEntry {
  id?: number;
  title: string;
  text: string;
  subject: string;
  createdAt: number;
  translations?: Record<string, { german: string; finnish: string }>;
}

function formatStoryDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const VERSION = "1.0.13";

// Find the character position N words before `charPos` in `text`.
function rewindPosition(text: string, charPos: number, wordsBack: number): number {
  const wordStarts: number[] = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text)) !== null && m.index < charPos) {
    wordStarts.push(m.index);
  }
  const target = wordStarts.length - wordsBack;
  return target > 0 ? wordStarts[target] : 0;
}

export default function VoiceTutor() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("english");
  const [spoken, setSpoken] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [repeatMode, setRepeatMode] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [radioStation, setRadioStation] = useState(0);
  const [isRadioPlaying, setIsRadioPlaying] = useState(false);
  const [isRadioLoading, setIsRadioLoading] = useState(false);

  // Vocabulary state
  const [vocabSubphase, setVocabSubphase] = useState<VocabSubphase>("category");
  const [vocabCategory, setVocabCategory] = useState("");
  const [vocabCustomInput, setVocabCustomInput] = useState("");
  const [vocabWords, setVocabWords] = useState<VocabWord[]>([]);
  const [vocabLearningDisplay, setVocabLearningDisplay] = useState<{
    finnish: string; german: string; showTranslation: boolean; index: number;
  } | null>(null);
  const [vocabQuizWord, setVocabQuizWord] = useState<VocabWord | null>(null);
  const [vocabLastResult, setVocabLastResult] = useState<{ correct: boolean; correctWord: string } | null>(null);

  const [useStoryContext, setUseStoryContext] = useState(false);

  // Story state
  const [storySubphase, setStorySubphase] = useState<StorySubphase>("input");
  const [storySubjectInput, setStorySubjectInput] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [storyText, setStoryText] = useState("");
  const [isStoryPlaying, setIsStoryPlaying] = useState(false);
  const [storySelectedKeys, setStorySelectedKeys] = useState<Set<string>>(new Set());
  const [storyVocabWords, setStoryVocabWords] = useState<VocabWord[]>([]);
  const [storyArchive, setStoryArchive] = useState<StoryEntry[]>([]);
  const [storyTooltip, setStoryTooltip] = useState<{ key: string; text: string | null } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const repeatModeRef = useRef(false);
  const hasRepeatedRef = useRef(false);
  const currentGermanRef = useRef("");
  const lastDiscussionReplyRef = useRef("");
  const modeRef = useRef<Mode>("english");

  // Vocabulary refs (read inside stable callbacks)
  const vocabSubphaseRef = useRef<VocabSubphase>("category");
  const vocabWordsRef = useRef<VocabWord[]>([]);
  const vocabQuizWordRef = useRef<VocabWord | null>(null);

  // Story refs
  const storySelectedKeysRef = useRef<Set<string>>(new Set());
  const storyKeyToGermanRef = useRef<Map<string, string>>(new Map());
  const storyTranslationCacheRef = useRef<Map<string, { german: string; finnish: string }>>(new Map());
  const currentStoryIdRef = useRef<number | null>(null);
  const storyPlayOffsetRef = useRef(0);
  const storyCharIndexRef = useRef(0);
  const storyPlayStartTimeRef = useRef(0);
  const storyUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { if (phase !== "listening") setMicReady(false); }, [phase]);

  const ttsQueueRef = useRef<TTSItem[]>([]);
  const clearTTSQueue = useCallback(() => { ttsQueueRef.current = []; }, []);

  useEffect(() => {
    fetch("/api/stories")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStoryArchive(data); })
      .catch(() => {});
  }, []);

  // Radio audio element lifecycle
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.onwaiting = () => setIsRadioLoading(true);
    audio.onplaying = () => { setIsRadioLoading(false); setIsRadioPlaying(true); };
    audio.onpause = () => { setIsRadioPlaying(false); setIsRadioLoading(false); };
    audio.onerror = () => { setIsRadioLoading(false); setIsRadioPlaying(false); };
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  useEffect(() => {
    if (mode !== "radio" && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
  }, [mode]);

  const playStation = useCallback((idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    setIsRadioLoading(true);
    setIsRadioPlaying(false);
    audio.src = RADIO_STATIONS[idx].url;
    audio.play().catch(() => { setIsRadioLoading(false); });
  }, []);

  const toggleRadio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isRadioPlaying || isRadioLoading) {
      audio.pause();
      audio.src = "";
    } else {
      playStation(radioStation);
    }
  }, [isRadioPlaying, isRadioLoading, radioStation, playStation]);

  const changeStation = useCallback((idx: number) => {
    setRadioStation(idx);
    if (isRadioPlaying || isRadioLoading) playStation(idx);
  }, [isRadioPlaying, isRadioLoading, playStation]);

  const handleTTSEnd = useCallback(() => {
    // Skip empty items
    while (ttsQueueRef.current.length > 0 && !ttsQueueRef.current[0].text) {
      ttsQueueRef.current.shift();
    }

    if (ttsQueueRef.current.length > 0) {
      const { text, delay, lang, onSpeak } = ttsQueueRef.current.shift()!;
      setTimeout(() => {
        onSpeak?.();
        speak(text, 1.0, lang ?? "de-DE");
      }, delay);
      return;
    }

    if (modeRef.current === "story") {
      return; // story manages its own utterance via storyUtteranceRef
    }

    if (modeRef.current === "vocabulary") {
      if (vocabSubphaseRef.current === "learning") {
        // Learning phase complete → start quiz
        const words = vocabWordsRef.current;
        if (words.length === 0) return;
        const word = words[Math.floor(Math.random() * words.length)];
        vocabQuizWordRef.current = word;
        vocabSubphaseRef.current = "quiz";
        setVocabSubphase("quiz");
        setVocabQuizWord(word);
        setVocabLastResult(null);
        setPhase("speaking");
        speak(word.finnish, 1.0, "fi-FI");
        return;
      }
      if (vocabSubphaseRef.current === "complete") {
        setPhase("idle");
        return;
      }
      // quiz phase TTS done → listen
      setPhase("listening");
      restart();
      return;
    }

    // Non-vocabulary: repeat-x2 logic
    if (repeatModeRef.current && !hasRepeatedRef.current) {
      hasRepeatedRef.current = true;
      setTimeout(() => speak(currentGermanRef.current), 2000);
    } else {
      hasRepeatedRef.current = false;
      setPhase("listening");
      restart();
    }
  }, []);

  const handleBoundary = useCallback((charIndex: number) => {
    storyCharIndexRef.current = charIndex;
  }, []);

  const { speak, cancel } = useSpeechSynthesis({ onEnd: handleTTSEnd, onBoundary: handleBoundary });

  const handleTranscript = useCallback(
    async (transcript: string) => {
      setSpoken(transcript);
      setPhase("processing");

      // Vocabulary quiz answer
      if (mode === "vocabulary") {
        const currentWord = vocabQuizWordRef.current;
        if (!currentWord) return;

        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "vocabulary_check",
              finnish: currentWord.finnish,
              german: currentWord.german,
              answer: transcript,
            }),
          });
          if (!res.ok) throw new Error("Failed");
          const data = await res.json();
          const correct = data.correct as boolean;

          // Update mastery
          const updated = vocabWordsRef.current.map((w) => {
            if (w.finnish !== currentWord.finnish) return w;
            return {
              ...w,
              consecutiveCorrect: correct ? w.consecutiveCorrect + 1 : 0,
              attempts: w.attempts + 1,
              correctAttempts: w.correctAttempts + (correct ? 1 : 0),
            };
          });
          vocabWordsRef.current = updated;
          setVocabWords(updated);
          setVocabLastResult({ correct, correctWord: currentWord.german });

          const remaining = updated.filter((w) => w.consecutiveCorrect < 2);
          setPhase("speaking");

          if (remaining.length === 0) {
            // All mastered!
            vocabSubphaseRef.current = "complete";
            setVocabSubphase("complete");
            ttsQueueRef.current = correct
              ? []
              : [{ text: "Ausgezeichnet! Du hast alle Wörter gelernt!", delay: 800 }];
            speak(
              correct
                ? "Richtig! Ausgezeichnet! Du hast alle Wörter gelernt!"
                : `Falsch, es heißt ${currentWord.german}.`
            );
            return;
          }

          // Pick next word (avoid repeating same word if possible)
          const pool = remaining.filter((w) => w.finnish !== currentWord.finnish);
          const nextWord = (pool.length > 0 ? pool : remaining)[
            Math.floor(Math.random() * (pool.length > 0 ? pool : remaining).length)
          ];
          vocabQuizWordRef.current = nextWord;
          setVocabQuizWord(nextWord);

          if (correct) {
            ttsQueueRef.current = [
              { text: nextWord.finnish, delay: 500, lang: "fi-FI", onSpeak: () => setVocabQuizWord(nextWord) },
            ];
            speak("Richtig!");
          } else {
            ttsQueueRef.current = [
              { text: currentWord.german, delay: 400 },
              { text: nextWord.finnish, delay: 800, lang: "fi-FI", onSpeak: () => setVocabQuizWord(nextWord) },
            ];
            speak(`Falsch, es heißt ${currentWord.german}.`);
          }
        } catch {
          setErrorMsg("Error checking answer. Listening again...");
          setPhase("error");
          setTimeout(() => { setPhase("listening"); restart(); }, 2000);
        }
        return;
      }

      // Other modes
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
            ...(mode === "discussion" && useStoryContext && storyText
              ? { storyContext: storyText }
              : {}),
          }),
        });

        if (!res.ok) throw new Error("Translation failed");

        const data = await res.json();
        const tagged: Result = { ...data, mode };
        setResult(tagged);
        currentGermanRef.current = data.german;
        hasRepeatedRef.current = false;
        if (mode === "discussion") lastDiscussionReplyRef.current = data.german;
        setEcho(data.german);
        setPhase("speaking");
        speak(data.german);
      } catch {
        setErrorMsg("Translation failed. Listening again...");
        setPhase("error");
        setTimeout(() => { setPhase("listening"); restart(); }, 2000);
      }
    },
    [speak, mode]
  );

  const handleError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setPhase("error");
  }, []);

  const silenceMs = mode === "vocabulary" ? 1000 : 1500;
  const resumeDelayMs = 0;

  const { start, stop, restart, setEcho } = useSpeechRecognition({
    onResult: handleTranscript,
    onError: handleError,
    onAudioStart: () => setMicReady(true),
    lang: MODE_LANG[mode],
    silenceMs,
    resumeDelayMs,
  });

  const resetVocabState = useCallback(() => {
    vocabSubphaseRef.current = "category";
    vocabWordsRef.current = [];
    vocabQuizWordRef.current = null;
    setVocabSubphase("category");
    setVocabCategory("");
    setVocabCustomInput("");
    setVocabWords([]);
    setVocabLearningDisplay(null);
    setVocabQuizWord(null);
    setVocabLastResult(null);
    clearTTSQueue();
  }, [clearTTSQueue]);

  const resetStoryState = useCallback(() => {
    if (storyUtteranceRef.current) {
      storyUtteranceRef.current.onend = null;
      storyUtteranceRef.current.onboundary = null;
      storyUtteranceRef.current.onerror = null;
      storyUtteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
    setStorySubphase("input");
    setStorySubjectInput("");
    setStoryTitle("");
    setStoryText("");
    setIsStoryPlaying(false);
    storySelectedKeysRef.current = new Set();
    storyKeyToGermanRef.current = new Map();
    storyTranslationCacheRef.current = new Map();
    currentStoryIdRef.current = null;
    storyPlayOffsetRef.current = 0;
    storyCharIndexRef.current = 0;
    storyPlayStartTimeRef.current = 0;
    setStorySelectedKeys(new Set());
    setStoryVocabWords([]);
    setStoryTooltip(null);
  }, []);

  const generateStory = useCallback(async (subject: string) => {
    setStorySubphase("loading");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "story_generate", subject }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const title = data.title ?? "";
      const text = data.story ?? "";
      setStoryTitle(title);
      setStoryText(text);
      setStorySubphase("reading");
      if (title && text) {
        const saved = await fetch("/api/stories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, text, subject, createdAt: Date.now() }),
        }).then((r) => r.json()).catch(() => null);
        if (saved?.id) currentStoryIdRef.current = saved.id;
        setStoryArchive((prev) => {
          const entry: StoryEntry = { id: saved?.id, title, text, subject, createdAt: saved?.createdAt ?? Date.now() };
          return [entry, ...prev.filter((s) => s.id !== saved?.id)].slice(0, 10);
        });
      }
    } catch {
      setStorySubphase("input");
    }
  }, []);

  const loadArchivedStory = useCallback((entry: StoryEntry) => {
    if (storyUtteranceRef.current) {
      storyUtteranceRef.current.onend = null;
      storyUtteranceRef.current.onboundary = null;
      storyUtteranceRef.current.onerror = null;
      storyUtteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
    storySelectedKeysRef.current = new Set();
    storyKeyToGermanRef.current = new Map();
    storyTranslationCacheRef.current = new Map(
      Object.entries(entry.translations ?? {}) as [string, { german: string; finnish: string }][]
    );
    currentStoryIdRef.current = entry.id ?? null;
    storyPlayOffsetRef.current = 0;
    storyCharIndexRef.current = 0;
    storyPlayStartTimeRef.current = 0;
    setStorySelectedKeys(new Set());
    setStoryVocabWords([]);
    setStoryTooltip(null);
    setIsStoryPlaying(false);
    setStorySubjectInput(entry.subject);
    setStoryTitle(entry.title);
    setStoryText(entry.text);
    setStorySubphase("reading");
  }, []);

  const startLearningPhase = useCallback((words: VocabWord[]) => {
    if (words.length === 0) return;
    vocabSubphaseRef.current = "learning";
    setVocabSubphase("learning");
    setPhase("speaking");

    const queue: TTSItem[] = [];
    words.forEach((word, i) => {
      // Reveal the Finnish translation after speaking German
      queue.push({
        text: word.finnish,
        delay: 1500,
        lang: "fi-FI",
        onSpeak: () => setVocabLearningDisplay({ finnish: word.finnish, german: word.german, showTranslation: true, index: i }),
      });
      // Move to next word, German first
      if (i < words.length - 1) {
        queue.push({
          text: words[i + 1].german,
          delay: 800,
          lang: "de-DE",
          onSpeak: () => setVocabLearningDisplay({ finnish: words[i + 1].finnish, german: words[i + 1].german, showTranslation: false, index: i + 1 }),
        });
      }
    });
    ttsQueueRef.current = queue;

    const first = words[0];
    setVocabLearningDisplay({ finnish: first.finnish, german: first.german, showTranslation: false, index: 0 });
    speak(first.german, 1.0, "de-DE");
  }, [speak]);

  const generateVocabulary = useCallback(async (category: string) => {
    setVocabSubphase("loading");
    vocabSubphaseRef.current = "loading";
    cancel();

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "vocabulary_generate", topic: category }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      const words: VocabWord[] = (data.words ?? []).map((w: { finnish: string; german: string }) => ({
        finnish: w.finnish,
        german: w.german,
        consecutiveCorrect: 0,
        attempts: 0,
        correctAttempts: 0,
      }));

      vocabWordsRef.current = words;
      setVocabWords(words);
      startLearningPhase(words);
    } catch {
      setVocabSubphase("category");
      vocabSubphaseRef.current = "category";
    }
  }, [cancel, startLearningPhase]);

  const handleToggleStoryContext = useCallback(async () => {
    const next = !useStoryContext;
    setUseStoryContext(next);
    if (!next || !storyText) return;

    setPhase("processing");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "discussion", storyContext: storyText, initialQuestion: true }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      lastDiscussionReplyRef.current = data.german;
      setResult({ mode: "discussion", german: data.german });
      setEcho(data.german);
      setPhase("speaking");
      speak(data.german);
    } catch {
      setPhase("idle");
    }
  }, [useStoryContext, storyText, speak, setEcho]);

  const startStoryVocab = useCallback(() => {
    const words = storyVocabWords.map(w => ({
      ...w,
      consecutiveCorrect: 0,
      attempts: 0,
      correctAttempts: 0,
    }));
    vocabWordsRef.current = words;
    setVocabWords(words);
    setVocabCategory("Latest story words");
    cancel();
    startLearningPhase(words);
  }, [storyVocabWords, cancel, startLearningPhase]);

  const persistTranslations = useCallback(() => {
    const id = currentStoryIdRef.current;
    if (!id) return;
    const translations = Object.fromEntries(storyTranslationCacheRef.current);
    fetch(`/api/stories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translations }),
    }).catch(() => {});
  }, []);

  const handleWordHover = useCallback(async (instanceKey: string, rawWord: string) => {
    const cacheKey = rawWord.toLowerCase();
    const cached = storyTranslationCacheRef.current.get(cacheKey);
    if (cached) {
      setStoryTooltip({ key: instanceKey, text: cached.finnish });
      return;
    }
    setStoryTooltip({ key: instanceKey, text: null });
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "word_translate", word: rawWord }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      storyTranslationCacheRef.current.set(cacheKey, { german: data.german, finnish: data.finnish });
      setStoryTooltip(prev => prev?.key === instanceKey ? { key: instanceKey, text: data.finnish } : prev);
      persistTranslations();
    } catch {
      setStoryTooltip(null);
    }
  }, []);

  const handleWordClick = useCallback(async (word: string) => {
    const key = word.toLowerCase();

    if (storySelectedKeysRef.current.has(key)) {
      storySelectedKeysRef.current.delete(key);
      setStorySelectedKeys(new Set(storySelectedKeysRef.current));
      const canonical = storyKeyToGermanRef.current.get(key);
      if (canonical) {
        storyKeyToGermanRef.current.delete(key);
        setStoryVocabWords(prev => prev.filter(w => w.german.toLowerCase() !== canonical));
      }
      return;
    }

    storySelectedKeysRef.current.add(key);
    setStorySelectedKeys(new Set(storySelectedKeysRef.current));

    const applyTranslation = (german: string, finnish: string) => {
      storyKeyToGermanRef.current.set(key, german.toLowerCase());
      const vocabWord: VocabWord = { german, finnish, consecutiveCorrect: 0, attempts: 0, correctAttempts: 0 };
      setStoryVocabWords(prev => {
        if (prev.some(w => w.german.toLowerCase() === german.toLowerCase())) return prev;
        return [...prev, vocabWord];
      });
    };

    const cached = storyTranslationCacheRef.current.get(key);
    if (cached) {
      applyTranslation(cached.german, cached.finnish);
      return;
    }

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "word_translate", word }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      storyTranslationCacheRef.current.set(key, { german: data.german, finnish: data.finnish });
      applyTranslation(data.german, data.finnish);
    } catch {
      storySelectedKeysRef.current.delete(key);
      setStorySelectedKeys(new Set(storySelectedKeysRef.current));
    }
  }, []);

  const toggleStoryPlay = useCallback(() => {
    if (isStoryPlaying) {
      // Use boundary charIndex when available; fall back to elapsed-time estimate.
      // Chrome often doesn't fire boundary events for cloud voices, so charIndex stays 0.
      const elapsed = Date.now() - storyPlayStartTimeRef.current;
      const charPos = storyCharIndexRef.current > 0
        ? storyCharIndexRef.current
        : Math.floor(elapsed * 0.015); // ~15 chars/sec for German TTS at rate 1.0
      const absolutePos = storyPlayOffsetRef.current + charPos;
      storyPlayOffsetRef.current = rewindPosition(storyText, absolutePos, 6);
      storyCharIndexRef.current = 0;
      if (storyUtteranceRef.current) {
        storyUtteranceRef.current.onend = null;
        storyUtteranceRef.current.onboundary = null;
        storyUtteranceRef.current.onerror = null;
        storyUtteranceRef.current = null;
      }
      window.speechSynthesis.cancel();
      setIsStoryPlaying(false);
    } else {
      storyCharIndexRef.current = 0;
      storyPlayStartTimeRef.current = Date.now();
      if (storyUtteranceRef.current) {
        storyUtteranceRef.current.onend = null;
        storyUtteranceRef.current.onboundary = null;
        storyUtteranceRef.current.onerror = null;
      }
      const text = storyText.slice(storyPlayOffsetRef.current);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "de-DE";
      utterance.rate = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const germanVoice =
        voices.find(v => v.lang === "de-DE" && v.localService) ||
        voices.find(v => v.lang.startsWith("de")) ||
        null;
      if (germanVoice) utterance.voice = germanVoice;
      utterance.onboundary = (e) => { storyCharIndexRef.current = e.charIndex; };
      utterance.onend = () => {
        storyPlayOffsetRef.current = 0;
        storyCharIndexRef.current = 0;
        storyPlayStartTimeRef.current = 0;
        storyUtteranceRef.current = null;
        setIsStoryPlaying(false);
      };
      utterance.onerror = () => {
        storyPlayOffsetRef.current = 0;
        storyCharIndexRef.current = 0;
        storyPlayStartTimeRef.current = 0;
        storyUtteranceRef.current = null;
        setIsStoryPlaying(false);
      };
      storyUtteranceRef.current = utterance;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      setIsStoryPlaying(true);
    }
  }, [isStoryPlaying, storyText]);

  const handleStart = useCallback(() => {
    setSpoken("");
    setResult(null);
    setPhase("listening");
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
    cancel();
    clearTTSQueue();
    setPhase("idle");
    setSpoken("");
    setResult(null);
    if (mode === "vocabulary") resetVocabState();
  }, [stop, cancel, clearTTSQueue, mode, resetVocabState]);

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (storyUtteranceRef.current) {
        storyUtteranceRef.current.onend = null;
        storyUtteranceRef.current.onboundary = null;
        storyUtteranceRef.current.onerror = null;
        storyUtteranceRef.current = null;
      }
      if (phase !== "idle") {
        stop();
        cancel();
        setPhase("idle");
      }
      clearTTSQueue();
      if (next !== "radio" && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      setMode(next);
      setSpoken("");
      setResult(null);
      lastDiscussionReplyRef.current = "";
      setIsStoryPlaying(false);
      resetVocabState();
    },
    [phase, stop, cancel, clearTTSQueue, resetVocabState]
  );

  // Space bar to start/stop (non-radio, non-vocabulary)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body && mode !== "radio" && mode !== "vocabulary" && mode !== "story") {
        e.preventDefault();
        if (phase === "idle" || phase === "error") handleStart();
        else handleStop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, mode, handleStart, handleStop]);

  const listeningLabel = !micReady
    ? "Starting..."
    : mode === "english"
    ? "Listening... (speak Finnish)"
    : "Listening... (speak German)";

  const processingLabel =
    mode === "english" ? "Translating..."
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

  // Vocabulary completion stats
  const totalAsked = vocabWords.reduce((s, w) => s + w.attempts, 0);
  const totalCorrect = vocabWords.reduce((s, w) => s + w.correctAttempts, 0);
  const accuracy = totalAsked > 0 ? Math.round((totalCorrect / totalAsked) * 100) : 0;
  const difficultWords = [...vocabWords]
    .filter((w) => w.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 select-none">
      <h1 className="text-xl font-semibold tracking-wide text-gray-400 mb-1">
        German Voice Tutor
      </h1>
      <p className="text-xs text-gray-700 mb-8">v{VERSION}</p>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-2 mb-10 justify-center">
        {([
          ["english", "FI → DE"],
          ["german", "DE correction"],
          ["discussion", "DE chat"],
          ["vocabulary", "Vocabulary"],
          ["radio", "Radio"],
          ["story", "Story"],
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

      {mode === "radio" ? (
        <div className="flex flex-col items-center">
          <p className="text-white text-lg font-semibold">{RADIO_STATIONS[radioStation].name}</p>
          <p className="text-gray-500 text-xs mt-1 mb-8">{RADIO_STATIONS[radioStation].desc}</p>

          <button
            onClick={toggleRadio}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none
              ${isRadioPlaying ? "bg-green-600 shadow-lg shadow-green-500/40" : ""}
              ${isRadioLoading ? "bg-yellow-600 animate-pulse shadow-lg shadow-yellow-500/40" : ""}
              ${!isRadioPlaying && !isRadioLoading ? "bg-gray-700 hover:bg-gray-600" : ""}
            `}
          >
            {isRadioLoading ? (
              <svg className="w-9 h-9 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            ) : isRadioPlaying ? (
              <svg className="w-9 h-9 fill-white" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1"/>
                <rect x="14" y="5" width="4" height="14" rx="1"/>
              </svg>
            ) : (
              <svg className="w-9 h-9 fill-white translate-x-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          <p className="mt-5 text-xs tracking-widest uppercase h-4">
            {isRadioPlaying && <span className="text-green-400 animate-pulse">● Live</span>}
            {isRadioLoading && <span className="text-yellow-500">Loading...</span>}
          </p>

          <div className="flex gap-2 mt-10">
            {RADIO_STATIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => changeStation(i)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                  ${radioStation === i
                    ? "bg-gray-200 text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

      ) : mode === "vocabulary" ? (
        /* ── Vocabulary mode ── */
        <div className="w-full max-w-lg">

          {vocabSubphase === "category" && (
            <div className="flex flex-col gap-6">
              <p className="text-center text-gray-400 text-sm tracking-wide">Choose a category</p>

              {storyVocabWords.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">From stories</p>
                  <button
                    onClick={startStoryVocab}
                    className="px-4 py-2 rounded-full text-xs font-semibold bg-yellow-600 text-white hover:bg-yellow-500 transition-colors"
                  >
                    Latest story words · {storyVocabWords.length} word{storyVocabWords.length !== 1 ? "s" : ""}
                  </button>
                </div>
              )}

              {VOCAB_CATEGORIES.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">{group}</p>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <button
                        key={item}
                        onClick={() => setVocabCategory(item)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                          ${vocabCategory === item
                            ? "bg-white text-gray-900"
                            : "bg-gray-800 text-gray-400 hover:text-gray-200"
                          }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Custom category..."
                  value={vocabCustomInput}
                  onChange={(e) => {
                    setVocabCustomInput(e.target.value);
                    setVocabCategory(e.target.value);
                  }}
                  className="flex-1 bg-gray-800 text-white text-sm px-4 py-2 rounded-full outline-none placeholder-gray-600 focus:ring-1 focus:ring-gray-500"
                />
              </div>

              <button
                disabled={!vocabCategory.trim()}
                onClick={() => generateVocabulary(vocabCategory.trim())}
                className={`mt-2 py-3 rounded-full text-sm font-semibold tracking-wide transition-colors
                  ${vocabCategory.trim()
                    ? "bg-white text-gray-900 hover:bg-gray-100"
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                  }`}
              >
                Start
              </button>
            </div>
          )}

          {vocabSubphase === "loading" && (
            <div className="flex flex-col items-center gap-4">
              <svg className="w-10 h-10 animate-spin text-gray-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <p className="text-gray-500 text-sm tracking-wide">Generating vocabulary for "{vocabCategory}"...</p>
            </div>
          )}

          {vocabSubphase === "learning" && vocabLearningDisplay && (
            <div className="flex flex-col items-center gap-6">
              <p className="text-xs text-gray-600 uppercase tracking-widest">
                Learning · {vocabLearningDisplay.index + 1} / {vocabWords.length}
              </p>

              <div className="text-center">
                <p className="text-white text-5xl font-bold tracking-wide mb-6">
                  {vocabLearningDisplay.german}
                </p>
                <div className={`transition-opacity duration-500 ${vocabLearningDisplay.showTranslation ? "opacity-100" : "opacity-0"}`}>
                  <p className="text-gray-400 text-2xl">{vocabLearningDisplay.finnish}</p>
                </div>
              </div>

              <button
                onClick={handleStop}
                className="mt-8 px-6 py-2 rounded-full text-xs text-gray-500 bg-gray-800 hover:text-gray-300 transition-colors"
              >
                Stop
              </button>
            </div>
          )}

          {vocabSubphase === "quiz" && (
            <div className="flex flex-col items-center gap-6">
              {/* Last result */}
              {vocabLastResult && (
                <div className="w-full mb-2">
                  <p className={`text-sm font-semibold uppercase tracking-widest ${vocabLastResult.correct ? "text-green-500" : "text-red-500"}`}>
                    {vocabLastResult.correct ? "✓ Richtig!" : "✗ Falsch"}
                  </p>
                  {!vocabLastResult.correct && (
                    <p className="text-white text-2xl font-bold mt-1">{vocabLastResult.correctWord}</p>
                  )}
                </div>
              )}

              {/* Progress */}
              <p className="text-xs text-gray-600 uppercase tracking-widest self-start">
                {vocabWords.filter((w) => w.consecutiveCorrect >= 2).length} / {vocabWords.length} mastered
              </p>

              {/* Current word */}
              {vocabQuizWord && (
                <div className="text-center w-full">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Translate to German</p>
                  <p className="text-white text-5xl font-bold tracking-wide">{vocabQuizWord.finnish}</p>
                </div>
              )}

              {/* Mic */}
              <button
                onClick={isActive ? handleStop : handleStart}
                className={`w-20 h-20 rounded-full text-2xl transition-all duration-200 focus:outline-none mt-4
                  ${phase === "listening" ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/40" : ""}
                  ${phase === "processing" ? "bg-yellow-500 shadow-lg shadow-yellow-500/40" : ""}
                  ${phase === "speaking" ? "bg-blue-500 shadow-lg shadow-blue-500/40" : ""}
                  ${phase === "idle" ? "bg-gray-700 hover:bg-gray-600" : ""}
                  ${phase === "error" ? "bg-gray-700" : ""}
                `}
              >
                {phase === "processing" ? "⏳" : phase === "speaking" ? "🔊" : "🎙️"}
              </button>

              <p className="text-xs text-gray-500 tracking-widest uppercase">{phaseLabel[phase]}</p>

              {spoken && <p className="text-gray-400 text-sm mt-2">"{spoken}"</p>}

              <button
                onClick={handleStop}
                className="mt-4 px-6 py-2 rounded-full text-xs text-gray-500 bg-gray-800 hover:text-gray-300 transition-colors"
              >
                Stop
              </button>
            </div>
          )}

          {vocabSubphase === "complete" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <p className="text-2xl font-bold text-white">Session complete!</p>

              <div className="w-full bg-gray-900 rounded-2xl p-6 text-left space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Category</span>
                  <span className="text-white font-medium">{vocabCategory}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Words</span>
                  <span className="text-white font-medium">{vocabWords.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Questions asked</span>
                  <span className="text-white font-medium">{totalAsked}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Accuracy</span>
                  <span className="text-white font-medium">{accuracy}%</span>
                </div>
                {difficultWords.length > 0 && (
                  <div className="pt-3 border-t border-gray-800">
                    <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Most difficult</p>
                    {difficultWords.map((w) => (
                      <p key={w.finnish} className="text-white text-sm">{w.german} <span className="text-gray-500">({w.finnish})</span></p>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={resetVocabState}
                className="mt-2 px-8 py-3 rounded-full bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 transition-colors"
              >
                New Session
              </button>
            </div>
          )}
        </div>

      ) : mode === "story" ? (
        /* ── Story mode ── */
        <div className="w-full max-w-lg">
          {storySubphase === "input" && (
            <div className="flex flex-col gap-4">
              <p className="text-center text-gray-400 text-sm tracking-wide">Enter a subject for a German story</p>
              <input
                type="text"
                placeholder="e.g. a dog and a cat, summer in Berlin..."
                value={storySubjectInput}
                onChange={(e) => setStorySubjectInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && storySubjectInput.trim()) {
                    generateStory(storySubjectInput.trim());
                  }
                }}
                className="bg-gray-800 text-white text-sm px-4 py-3 rounded-full outline-none placeholder-gray-600 focus:ring-1 focus:ring-gray-500"
              />
              <button
                disabled={!storySubjectInput.trim()}
                onClick={() => generateStory(storySubjectInput.trim())}
                className={`py-3 rounded-full text-sm font-semibold tracking-wide transition-colors
                  ${storySubjectInput.trim()
                    ? "bg-white text-gray-900 hover:bg-gray-100"
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                  }`}
              >
                Generate Story
              </button>

              {storyArchive.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-xs text-gray-600 uppercase tracking-widest">Past stories</p>
                  <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                    {storyArchive.map((entry) => (
                      <button
                        key={entry.createdAt}
                        onClick={() => loadArchivedStory(entry)}
                        className="text-left px-4 py-3 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors"
                      >
                        <p className="text-white text-sm font-medium leading-snug">{entry.title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{entry.subject} · {formatStoryDate(entry.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {storySubphase === "loading" && (
            <div className="flex flex-col items-center gap-4">
              <svg className="w-10 h-10 animate-spin text-gray-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <p className="text-gray-500 text-sm tracking-wide">Generating story...</p>
            </div>
          )}

          {storySubphase === "reading" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                {storyTitle && (
                  <h2 className="text-white text-2xl font-bold">{storyTitle}</h2>
                )}
                <button
                  onClick={toggleStoryPlay}
                  className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors
                    ${isStoryPlaying ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  {isStoryPlaying ? (
                    <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                      <rect x="6" y="5" width="4" height="14" rx="1"/>
                      <rect x="14" y="5" width="4" height="14" rx="1"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                      <path d="M9 5l9 7-9 7V5z"/>
                    </svg>
                  )}
                </button>
              </div>

              <p className="text-xs text-gray-600 uppercase tracking-widest">Hover words to translate · click to save for vocabulary</p>

              <div className="text-gray-300 text-base leading-relaxed space-y-4 select-text">
                {storyText.split("\n\n").map((para, pi) => (
                  <p key={pi}>
                    {para.split(" ").map((token, wi) => {
                      const clean = token.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
                      const isSelected = clean ? storySelectedKeys.has(clean.toLowerCase()) : false;
                      const instanceKey = `${pi}-${wi}`;
                      const showTooltip = clean && storyTooltip?.key === instanceKey;
                      return (
                        <span key={wi}>
                          {wi > 0 && " "}
                          {clean ? (
                            <span
                              className="relative inline"
                              onMouseEnter={() => handleWordHover(instanceKey, clean)}
                              onMouseLeave={() => setStoryTooltip(null)}
                              onClick={() => handleWordClick(clean)}
                            >
                              <span
                                className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-gray-700
                                  ${isSelected ? "text-yellow-400" : ""}`}
                              >
                                {token}
                              </span>
                              {showTooltip && (
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-xs bg-gray-900 text-gray-100 rounded border border-gray-700 whitespace-nowrap z-20 pointer-events-none">
                                  {storyTooltip!.text ?? "…"}
                                </span>
                              )}
                            </span>
                          ) : token}
                        </span>
                      );
                    })}
                  </p>
                ))}
              </div>

              {storyVocabWords.length > 0 && (
                <p className="text-xs text-gray-500 text-center pt-1">
                  {storyVocabWords.length} word{storyVocabWords.length !== 1 ? "s" : ""} saved · go to Vocabulary to quiz them
                </p>
              )}

              <button
                onClick={resetStoryState}
                className="mt-2 py-3 rounded-full bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                New Story
              </button>
            </div>
          )}
        </div>

      ) : (
        /* ── Other modes ── */
        <>
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

          <p className="mt-6 text-sm text-gray-400 tracking-widest uppercase">
            {phaseLabel[phase]}
          </p>

          {spoken && (
            <div className="mt-10 w-full max-w-md">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">You said</p>
              <p className="text-gray-300 text-lg">{spoken}</p>
            </div>
          )}

          {result && (
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

          <div className="mt-12 flex gap-2 flex-wrap justify-center">
            <button
              onClick={() => setRepeatMode((v) => !v)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors
                ${repeatMode
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-500 hover:text-gray-300"
                }`}
            >
              Repeat ×2
            </button>

            {mode === "discussion" && storyText && (
              <button
                onClick={handleToggleStoryContext}
                className={`px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors
                  ${useStoryContext
                    ? "bg-yellow-600 text-white"
                    : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
              >
                {useStoryContext ? `📖 ${storyTitle || "Story"}` : "Use story"}
              </button>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-700">Space to start / stop</p>
        </>
      )}
    </div>
  );
}
