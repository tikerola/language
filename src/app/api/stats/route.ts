import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { data, error } = await supabase
    .from("user_stats")
    .select("streak, words_mastered")
    .eq("id", 1)
    .single();
  if (error) return NextResponse.json({ streak: 0, words_mastered: 0 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();

  if (body.action === "activity") {
    const today = body.date as string;
    const { data: row } = await supabase
      .from("user_stats")
      .select("streak, last_active_date")
      .eq("id", 1)
      .single();

    if (!row) return NextResponse.json({ streak: 1 });

    if (row.last_active_date === today) {
      return NextResponse.json({ streak: row.streak });
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const newStreak = row.last_active_date === yesterdayStr ? row.streak + 1 : 1;

    await supabase
      .from("user_stats")
      .update({ streak: newStreak, last_active_date: today })
      .eq("id", 1);

    return NextResponse.json({ streak: newStreak });
  }

  if (body.action === "mastered") {
    const { data: row } = await supabase
      .from("user_stats")
      .select("words_mastered")
      .eq("id", 1)
      .single();

    const newTotal = (row?.words_mastered ?? 0) + (body.count as number);

    await supabase
      .from("user_stats")
      .update({ words_mastered: newTotal })
      .eq("id", 1);

    return NextResponse.json({ words_mastered: newTotal });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
