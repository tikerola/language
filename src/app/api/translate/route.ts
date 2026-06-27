import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const PROMPTS = {
  english: {
    system: `Translate the Finnish sentence to natural spoken German (A2/B1 level). Reply with JSON only:\n{"german":"<translation>","literal":"<word-for-word Finnish>","pronunciation":"<simplified phonetic>"}`,
    user: (text: string) => text,
  },
  german: {
    system: `Correct the German sentence to natural spoken German (A2/B1). If already correct, return unchanged with empty note. Reply with JSON only:\n{"german":"<corrected sentence>","note":"<short correction description, or empty string>"}`,
    user: (text: string) => text,
  },
  discussion: {
    system: `You are a friendly native German speaker. Reply naturally in spoken German (A2/B1), 1–3 sentences. No corrections, no English. If a previous reply is given and the message references it, answer in that context. Reply with JSON only:\n{"german":"<your reply>"}`,
    user: (text: string, context?: string) =>
      context ? `Previous reply: "${context}"\n\nUser: ${text}` : text,
  },
  vocabulary: {
    system: `You are a Finnish→German vocabulary quiz. The student is Finnish and must say the German translation of each Finnish word you give them.

CRITICAL RULES:
1. The "word" field must ALWAYS be a Finnish word (e.g. "maito", "vesi", "koira"). NEVER put a German word in the "word" field.
2. The "tts" field is what gets spoken aloud — use German for feedback, Finnish for the quiz word.
3. NEVER reuse any word that appears in "Used words".

Return JSON only: {"tts":"<spoken text>","word":"<Finnish word>","correct":true|false}

tts format:
- No Answer given (first word): just the Finnish word itself, e.g. "maito"
- Answer correct: "Richtig! <next Finnish word>"
- Answer wrong: "Falsch, es heißt <correct German word>. <next Finnish word>"

correct field: true or false. Omit only when no Answer was given.

Examples:
Topic: ruoka → {"tts":"maito","word":"maito"}
Topic: ruoka, Word: maito, Answer: Milch, Used words: maito → {"tts":"Richtig! vesi","word":"vesi","correct":true}
Topic: ruoka, Word: vesi, Answer: Milch, Used words: maito,vesi → {"tts":"Falsch, es heißt Wasser. leipä","word":"leipä","correct":false}`,
    user: (topic: string, word?: string, answer?: string, usedWords?: string) => {
      const lines = word && answer
        ? [`Topic: ${topic}`, `Word: ${word}`, `Answer: ${answer}`]
        : [`Topic: ${topic}`];
      if (usedWords) lines.push(`Used words: ${usedWords}`);
      return lines.join("\n");
    },
  },
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function makeModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    } as any,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { mode = "english" } = body;

  try {
    if (mode === "vocabulary") {
      const { topic, word, answer, usedWords } = body;
      if (!topic?.trim()) {
        return NextResponse.json({ error: "No topic provided" }, { status: 400 });
      }
      const prompt = PROMPTS.vocabulary;
      const result = await makeModel().generateContent([
        { text: prompt.system },
        { text: prompt.user(topic.trim(), word?.trim(), answer?.trim(), usedWords?.trim()) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

    const { text, context } = body;
    if (!text?.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }
    const prompt = PROMPTS[mode as keyof typeof PROMPTS] ?? PROMPTS.english;
    const result = await makeModel().generateContent([
      { text: prompt.system },
      { text: prompt.user(text.trim(), context) },
    ]);
    return NextResponse.json(JSON.parse(result.response.text()));
  } catch (err) {
    console.error("Gemini error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
