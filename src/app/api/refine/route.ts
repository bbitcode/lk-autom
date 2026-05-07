import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateText } from "@/lib/gemini";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { post_id, instruction } = await req.json();
    const supabase = getSupabase();

    const { data: item, error } = await supabase
      .from("content_items")
      .select("*")
      .eq("id", post_id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const langName = item.copy_language === "en" ? "English" : "Spanish";

    const rewritten = await generateText(
      `You rewrite social media posts based on user instructions. Keep the same general topic but adjust based on the instruction. Do NOT mention or promote Aloud unless the user explicitly asks for it. Respond ONLY with the rewritten post text — no JSON, no labels, no quotes.`,
      `Current post (${langName}, platform: ${item.platform}):

${item.copy_text || ""}

INSTRUCTION: ${instruction}

Rewrite the post in ${langName} following the instruction.`
    );

    const newCopy = rewritten.trim() || item.copy_text;

    const { data: updated, error: updateError } = await supabase
      .from("content_items")
      .update({ copy_text: newCopy })
      .eq("id", post_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Refine error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
