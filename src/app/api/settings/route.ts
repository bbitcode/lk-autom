import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const supabase = getSupabase();

  const [membersRes, contextRes] = await Promise.all([
    supabase.from("team_members").select("*").order("name"),
    supabase.from("company_context").select("*").order("key"),
  ]);

  return NextResponse.json({
    members: membersRes.data || [],
    context: contextRes.data || [],
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const supabase = getSupabase();

  if (body.type === "member") {
    const { id, tone_description, writing_samples, language } = body;
    const { data, error } = await supabase
      .from("team_members")
      .update({ tone_description, writing_samples, language })
      .eq("id", id)
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.type === "context") {
    const { key, value } = body;
    const { data, error } = await supabase
      .from("company_context")
      .upsert({ key, value }, { onConflict: "key" })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
