import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a German language tutor.
Translate the user's English sentence into natural spoken German.

Rules:
- Respond only in JSON.
- Prefer natural spoken language over textbook phrasing.
- Keep vocabulary around A2/B1 unless the user requests otherwise.
- Return exactly one sentence.
- Do not explain. Do not apologize. Do not include English.

Return this exact JSON shape:
{"german":"<translation>","literal":"<word-for-word English>","pronunciation":"<simplified phonetic>"}`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text?.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `Translate to German: ${text.trim()}` },
    ]);

    const raw = result.response.text();
    const parsed = JSON.parse(raw);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Gemini error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
