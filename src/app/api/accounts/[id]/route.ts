import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, slug, color_palette, brand_style, logo_path, logo_url, fonts } = body;

  const supabase = getSupabase();
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (color_palette !== undefined) updates.color_palette = color_palette;
  if (brand_style !== undefined) updates.brand_style = brand_style;
  if (logo_path !== undefined) updates.logo_path = logo_path;
  if (logo_url !== undefined) updates.logo_url = logo_url;
  if (fonts !== undefined) updates.fonts = fonts;

  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabase();

  // Prevent deleting the default account
  const { data: account } = await supabase
    .from("accounts")
    .select("is_default")
    .eq("id", id)
    .single();

  if (account?.is_default) {
    return NextResponse.json({ error: "Cannot delete the default account" }, { status: 400 });
  }

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
