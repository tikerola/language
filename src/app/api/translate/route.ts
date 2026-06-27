import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const PROMPTS = {
  english: {
    system: `You are a German language tutor.
Translate the user's Finnish sentence into natural spoken German.

Rules:
- Respond only in JSON.
- Prefer natural spoken language over textbook phrasing.
- Keep vocabulary around A2/B1 unless the user requests otherwise.
- Return exactly one sentence.
- Do not explain. Do not apologize. Do not include Finnish.

Return this exact JSON shape:
{"german":"<translation>","literal":"<word-for-word Finnish>","pronunciation":"<simplified phonetic>"}`,
    user: (text: string) => `Translate to German: ${text}`,
  },
  german: {
    system: `You are a German language tutor.
The user will speak German, possibly with mistakes. Identify what they meant and return the natural, correct German sentence.

Rules:
- Respond only in JSON.
- Prefer natural spoken language over textbook phrasing.
- Keep vocabulary around A2/B1.
- Return exactly one corrected sentence.
- If the sentence was already correct, return it unchanged with an empty note.

Return this exact JSON shape:
{"german":"<corrected sentence>","note":"<one short phrase describing the main correction, or empty string if already correct>"}`,
    user: (text: string) => `Correct this German: ${text}`,
  },
  discussion: {
    system: `You are a friendly native German speaker having a casual conversation.
The user is a German learner practising conversation. Reply naturally to what they say, as a human would.

Rules:
- Respond only in JSON.
- Reply in natural, spoken German — not formal or textbook language.
- Keep vocabulary around A2/B1 so the learner can follow.
- Keep your reply short: 1–3 sentences at most.
- Do not correct mistakes, just respond to the meaning.
- Do not break character. Do not explain anything in English.
- If a "Previous reply" is provided and the user's message seems to reference it, answer in that context.

Return this exact JSON shape:
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
      generationConfig: { responseMimeType: "application/json" },
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
