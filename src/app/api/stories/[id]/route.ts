import { supabase } from "@/lib/supabase";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/stories/[id]">
) {
  const { id } = await ctx.params;
  const { translations, vocabWords } = await req.json();
  const update: Record<string, unknown> = {};
  if (translations !== undefined) update.translations = translations;
  if (vocabWords !== undefined) update.vocab_words = vocabWords;
  const { error } = await supabase
    .from("stories")
    .update(update)
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
