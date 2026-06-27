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
    system: `You are a Finnish→German vocabulary trainer.
If only "Topic" is given: return the first Finnish vocabulary word for that topic.
If "Topic", "Word", and "Answer" are given: check if the German answer is correct for the Finnish word, then give the next Finnish word.
Return JSON only: {"tts":"<text to speak>","word":"<next Finnish word>","correct":true|false}
tts rules (keep short):
- First word (no answer): just the Finnish word, e.g. "maito"
- Correct: "Richtig! <next word>"
- Wrong: "Falsch, es heißt <correct German>. <next word>"
word: just the Finnish word, no punctuation. correct: omit for first word.
Choose common A2/B1 vocabulary. Never use any word listed under "Used words".`,
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
