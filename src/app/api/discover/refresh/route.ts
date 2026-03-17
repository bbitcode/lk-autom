import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST() {
  const supabase = getSupabase();
  await supabase.from("discover_cache").delete().eq("source_type", "rss");
  return NextResponse.json({ success: true });
}
