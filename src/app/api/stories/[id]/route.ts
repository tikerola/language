import { supabase } from "@/lib/supabase";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/stories/[id]">
) {
  const { id } = await ctx.params;
  const { translations } = await req.json();
  const { error } = await supabase
    .from("stories")
    .update({ translations })
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
