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
  vocabulary_generate: {
    system: `Generate exactly 10 useful, commonly used German vocabulary words for the given topic/category.
The learner is Finnish, so provide the Finnish translation of each word.
Rules:
- Prefer nouns with their correct article (der, die, das)
- For verbs, use the infinitive form
- For adjectives and adverbs, use the base form
- Prefer words a beginner/intermediate learner (A1–B1) would encounter in daily life
- Avoid obscure, rare, technical, or literary vocabulary
- Exactly 10 words, no duplicates
- The Finnish word should be a natural, common Finnish equivalent

Return JSON only:
{"words":[{"finnish":"<Finnish word>","german":"<German word with article if noun>"},...]}`,
    user: (topic: string) => `Topic/Category: ${topic}`,
  },
  vocabulary_check: {
    system: `Evaluate if the student's spoken German answer is correct for the given Finnish word.
Rules:
- Capitalization never matters ("milch" = "Milch")
- Missing or wrong article (der/die/das) is acceptable
- Accept clear synonyms
- Accept minor speech-recognition typos
- If the answer matches the correct German word (ignoring case/articles), it is always correct

Return JSON only: {"correct":true|false}`,
    user: (finnish: string, german: string, answer: string) =>
      `Finnish word: ${finnish}\nCorrect German: ${german}\nStudent answer: ${answer}`,
  },
  word_translate: {
    system: `Given a German word (possibly inflected), return its canonical dictionary form and Finnish translation.
- Nouns: singular nominative with article (der/die/das)
- Verbs: infinitive form
- Adjectives/adverbs: base form
Return JSON only: {"german":"<canonical form>","finnish":"<Finnish translation>"}`,
    user: (word: string) => `German word: ${word}`,
  },
  story_generate: {
    system: `You are a German language teacher. Write a short, engaging story in German (A2/B1 level) based on the given subject.
The story should be 3–5 paragraphs, use simple but natural German, and be interesting to read.
Reply with JSON only: {"title":"<story title in German>","story":"<the full story in German, paragraphs separated by \\n\\n>"}`,
    user: (subject: string) => `Subject: ${subject}`,
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
    if (mode === "vocabulary_generate") {
      const { topic } = body;
      if (!topic?.trim()) {
        return NextResponse.json({ error: "No topic provided" }, { status: 400 });
      }
      const prompt = PROMPTS.vocabulary_generate;
      const result = await makeModel().generateContent([
        { text: prompt.system },
        { text: prompt.user(topic.trim()) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

    if (mode === "word_translate") {
      const { word } = body;
      if (!word?.trim()) {
        return NextResponse.json({ error: "No word provided" }, { status: 400 });
      }
      const prompt = PROMPTS.word_translate;
      const result = await makeModel().generateContent([
        { text: prompt.system },
        { text: prompt.user(word.trim()) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

    if (mode === "story_generate") {
      const { subject } = body;
      if (!subject?.trim()) {
        return NextResponse.json({ error: "No subject provided" }, { status: 400 });
      }
      const prompt = PROMPTS.story_generate;
      const result = await makeModel().generateContent([
        { text: prompt.system },
        { text: prompt.user(subject.trim()) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

    if (mode === "vocabulary_check") {
      const { finnish, german, answer } = body;
      if (!answer?.trim()) {
        return NextResponse.json({ correct: false });
      }
      // Fast client-side check: strip articles and compare lowercase
      const norm = (s: string) =>
        s.trim().toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, "");
      if (norm(answer) === norm(german)) {
        return NextResponse.json({ correct: true });
      }
      const prompt = PROMPTS.vocabulary_check;
      const result = await makeModel().generateContent([
        { text: prompt.system },
        { text: prompt.user(finnish, german, answer.trim()) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

    const { text, context } = body;
    if (!text?.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }
    const prompt = PROMPTS[mode as keyof typeof PROMPTS] ?? PROMPTS.english;
    const result = await makeModel().generateContent([
      { text: (prompt as any).system },
      { text: (prompt as any).user(text.trim(), context) },
    ]);
    return NextResponse.json(JSON.parse(result.response.text()));
  } catch (err) {
    console.error("Gemini error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
