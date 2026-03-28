import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, slug, color_palette, brand_style } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      color_palette: color_palette || [],
      brand_style: brand_style || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
