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

RULES:
1. "word" field: ALWAYS a Finnish word (e.g. "maito", "vesi"). NEVER German.
2. "correctWord" field: the correct German translation of the Word that was answered. Empty string on first word.
3. "tts" field: spoken aloud — German for feedback, Finnish for the quiz word.
4. NEVER return a word from "Used words". Check this list every time before choosing.
5. NEVER use the Topic word itself as a vocabulary word. The Topic is a category, not a quiz word.

Return JSON only:
{"tts":"<spoken>","word":"<next Finnish word>","correct":true|false,"correctWord":"<German>"}

tts format:
- No Answer (first word): just the Finnish word, e.g. "maito"
- Correct: "Richtig! <next Finnish word>"
- Wrong: "Falsch, es heißt <correct German>. <next Finnish word>"

correct: true or false. Omit only when no Answer given.
Evaluation rules: capitalization never matters ("schwimmen" = "Schwimmen"). Missing or wrong article is fine. Accept clear synonyms and minor speech-recognition typos. If the answer is the same word as the correct German translation, it is ALWAYS correct.

Examples:
Topic: ruoka
→ {"tts":"maito","word":"maito","correctWord":""}

Topic: ruoka, Word: maito, Answer: Milch, Used words: maito
→ {"tts":"Richtig! vesi","word":"vesi","correct":true,"correctWord":"Milch"}

Topic: ruoka, Word: vesi, Answer: Milch, Used words: maito,vesi
→ {"tts":"Falsch, es heißt Wasser. leipä","word":"leipä","correct":false,"correctWord":"Wasser"}`,
    user: (topic: string, word?: string, answer?: string, usedWords?: string) => {
      const lines = word && answer
        ? [`Topic: ${topic}`, `Word: ${word}`, `Answer: ${answer}`]
        : [`Topic: ${topic} (this is the category only — do NOT use "${topic}" as the quiz word)`];
      if (usedWords) lines.push(`Used words (never repeat any of these): ${usedWords}`);
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
      const userMsg = prompt.user(topic.trim(), word?.trim(), answer?.trim(), usedWords?.trim());

      let parsed = JSON.parse(
        (await makeModel().generateContent([{ text: prompt.system }, { text: userMsg }]))
          .response.text()
      );

      // Safety net: if the model returned a used word, retry once with an explicit override
      if (usedWords?.trim()) {
        const used = new Set(usedWords.split(",").map((w: string) => w.trim().toLowerCase()));
        if (parsed.word && used.has(parsed.word.toLowerCase())) {
          const retryMsg = userMsg +
            `\n\nYou returned "${parsed.word}" which is already in the Used words list. You MUST choose a different Finnish word not in that list.`;
          parsed = JSON.parse(
            (await makeModel().generateContent([{ text: prompt.system }, { text: retryMsg }]))
              .response.text()
          );
        }
      }

      return NextResponse.json(parsed);
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
