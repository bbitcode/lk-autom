import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateText } from "@/lib/gemini";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { post_id, instruction } = await req.json();
    const supabase = getSupabase();

    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const responseText = await generateText(
      `You rewrite LinkedIn posts based on user instructions. Keep the same general topic but adjust based on the instruction. Do NOT mention or promote Aloud unless the user explicitly asks for it.`,
      `Here are the current versions of a LinkedIn post:

ENGLISH:
${post.content_en || "N/A"}

SPANISH:
${post.content_es || "N/A"}

INSTRUCTION: ${instruction}

Rewrite both versions following the instruction. Format as JSON:
{"content_en": "...", "content_es": "..."}`
    );

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const generated = JSON.parse(jsonMatch[0]);

    const { data: updated, error: updateError } = await supabase
      .from("posts")
      .update({
        content_en: generated.content_en || post.content_en,
        content_es: generated.content_es || post.content_es,
      })
      .eq("id", post_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Refine error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
