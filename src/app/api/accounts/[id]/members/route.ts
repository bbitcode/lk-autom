import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET: list members assigned to this account
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("account_members")
    .select("member_id, team_members(*)")
    .eq("account_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = (data || []).map((row) => row.team_members).filter(Boolean);
  return NextResponse.json(members);
}

// POST: assign existing member or create new member and assign
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = getSupabase();

  // Create new member
  if (body.action === "create") {
    const { name, language, tone_description, writing_samples } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data: member, error: createError } = await supabase
      .from("team_members")
      .insert({ name, language: language || "es", tone_description, writing_samples })
      .select()
      .single();

    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

    // Assign to account
    await supabase.from("account_members").insert({ account_id: id, member_id: member.id });

    return NextResponse.json(member);
  }

  // Assign existing member
  if (body.action === "assign") {
    const { member_id } = body;
    const { error } = await supabase
      .from("account_members")
      .insert({ account_id: id, member_id })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE: unassign member from account
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { member_id } = await req.json();

  const supabase = getSupabase();
  const { error } = await supabase
    .from("account_members")
    .delete()
    .eq("account_id", id)
    .eq("member_id", member_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
