import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const PROMPTS = {
  english: {
    system: `Translate the Finnish sentence to natural spoken German (A2/B1 level). Reply with JSON only:
{"german":"<translation>","literal":"<word-for-word Finnish>","pronunciation":"<simplified phonetic>"}`,
    user: (text: string) => text,
  },
  german: {
    system: `Correct the German sentence to natural spoken German (A2/B1). If already correct, return unchanged with empty note. Reply with JSON only:
{"german":"<corrected sentence>","note":"<short correction description, or empty string>"}`,
    user: (text: string) => text,
  },
  discussion: {
    system: `You are a friendly native German speaker. Reply naturally in spoken German (A2/B1), 1–3 sentences. No corrections, no English. If a previous reply is given and the message references it, answer in that context. Reply with JSON only:
{"german":"<your reply>"}`,
    user: (text: string, context?: string) =>
      context ? `Previous reply: "${context}"\n\nUser: ${text}` : text,
  },
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const { text, mode = "english", context } = await req.json();

  if (!text?.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const prompt = PROMPTS[mode as keyof typeof PROMPTS] ?? PROMPTS.english;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        // Disable thinking — unnecessary for translation, saves several seconds
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    const result = await model.generateContent([
      { text: prompt.system },
      { text: prompt.user(text.trim(), context) },
    ]);

    const raw = result.response.text();
    const parsed = JSON.parse(raw);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Gemini error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
