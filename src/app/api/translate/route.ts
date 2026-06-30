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
  grammar_generate: {
    system: `You are a German language teacher. Generate exactly 6 fill-in-the-blank German grammar exercises for the given topic.
Rules:
- Appropriate for A2/B1 learners
- Exactly one ___ blank per sentence
- Clear, unambiguous answer (single word or short phrase)
- Use common everyday vocabulary
- Test different aspects of the topic

Reply with JSON only:
{"exercises":[{"sentence":"<German sentence with ___ for the blank>","answer":"<correct word or phrase>","hint":"<short grammar label in English, e.g. 'dative article (masculine)'>","nominative":"<base/nominative form of the answer word so the learner knows what word to look for — e.g. if answer is 'dem' write 'der'; if answer is 'einen' write 'ein'; if answer is 'ging' write 'gehen'; if answer is 'schönen' write 'schön'; if answer is a whole phrase just repeat it>"}]}`,
    user: (topic: string) => `Grammar topic: ${topic}`,
  },
  grammar_check: {
    system: `Check if the student's spoken answer correctly fills the blank in a German grammar exercise.
Rules:
- Ignore capitalisation
- Accept minor speech-recognition errors for the same word
- If multiple grammatical forms are valid in context, accept them
- Be strict about core grammar (wrong case or tense = wrong)
Reply with JSON only: {"correct":true|false}`,
    user: (sentence: string, answer: string, userAnswer: string) =>
      `Sentence: ${sentence}\nCorrect answer: ${answer}\nStudent answer: ${userAnswer}`,
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
    if (mode === "grammar_generate") {
      const { topic } = body;
      if (!topic?.trim()) return NextResponse.json({ error: "No topic" }, { status: 400 });
      const prompt = PROMPTS.grammar_generate;
      const result = await makeModel().generateContent([
        { text: prompt.system },
        { text: prompt.user(topic.trim()) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

    if (mode === "grammar_check") {
      const { sentence, answer, userAnswer } = body;
      const norm = (s: string) => s?.trim().toLowerCase().replace(/[.,!?;:-]/g, "") ?? "";
      if (norm(userAnswer) === norm(answer)) return NextResponse.json({ correct: true });
      const prompt = PROMPTS.grammar_check;
      const result = await makeModel().generateContent([
        { text: prompt.system },
        { text: prompt.user(sentence, answer, userAnswer) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

    if (mode === "discussion" && body.storyContext && body.initialQuestion) {
      const systemPrompt = `${PROMPTS.discussion.system}\n\nThe user has just read this German story:\n\n${body.storyContext}\n\nOpen the conversation by asking the user one specific, engaging question about the story in German.`;
      const result = await makeModel().generateContent([
        { text: systemPrompt },
        { text: "Beginne das Gespräch." },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
    }

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

    const { text, context, storyContext } = body;
    if (!text?.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    if (mode === "discussion" && storyContext) {
      const systemPrompt = `${PROMPTS.discussion.system}\n\nThe user has just read this German story and may want to discuss it:\n\n${storyContext}`;
      const result = await makeModel().generateContent([
        { text: systemPrompt },
        { text: PROMPTS.discussion.user(text.trim(), context) },
      ]);
      return NextResponse.json(JSON.parse(result.response.text()));
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
