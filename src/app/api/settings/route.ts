import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const account_id = searchParams.get("account_id");
  const supabase = getSupabase();

  const [membersRes, contextRes] = await Promise.all([
    supabase.from("team_members").select("*").order("name"),
    account_id
      ? supabase.from("company_context").select("*").eq("account_id", account_id).order("key")
      : supabase.from("company_context").select("*").order("key"),
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
    const { key, value, account_id } = body;
    if (!account_id) {
      return NextResponse.json({ error: "account_id is required" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("company_context")
      .upsert({ key, value, account_id }, { onConflict: "account_id,key" })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.type === "create_member") {
    const { name, language } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const { data, error } = await supabase
      .from("team_members")
      .insert({ name, language: language || "es" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.type === "delete_member") {
    const { id } = body;
    // Delete from account_members first (cascade should handle it, but be safe)
    await supabase.from("account_members").delete().eq("member_id", id);
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
