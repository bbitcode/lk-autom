import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const account_id = searchParams.get("account_id");
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const content_type = searchParams.get("content_type");

  const supabase = getSupabase();
  let query = supabase
    .from("content_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (account_id) query = query.eq("account_id", account_id);
  if (platform) query = query.eq("platform", platform);
  if (status) query = query.eq("status", status);
  if (content_type) query = query.eq("content_type", content_type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
