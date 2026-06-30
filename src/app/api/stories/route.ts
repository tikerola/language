import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    data.map((row) => ({
      id: row.id,
      title: row.title,
      text: row.text,
      subject: row.subject,
      createdAt: row.created_at,
      translations: row.translations ?? {},
    }))
  );
}

export async function POST(req: NextRequest) {
  const { title, text, subject, createdAt } = await req.json();
  const { data, error } = await supabase
    .from("stories")
    .insert({ title, text, subject, created_at: createdAt, translations: {} })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Delete stories beyond the 10 most recent
  const { data: old } = await supabase
    .from("stories")
    .select("id")
    .order("created_at", { ascending: false })
    .range(10, 9999);
  if (old && old.length > 0) {
    await supabase.from("stories").delete().in("id", old.map((r) => r.id));
  }

  return NextResponse.json({
    id: data.id,
    title: data.title,
    text: data.text,
    subject: data.subject,
    createdAt: data.created_at,
  });
}
