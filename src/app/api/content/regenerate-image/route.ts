import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateContentImage } from "@/lib/image-gen";
import type { ImageFormat } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { content_item_id, prompt, image_format, image_model } = await req.json();

    const supabase = getSupabase();
    const { data: item, error } = await supabase
      .from("content_items")
      .select("*")
      .eq("id", content_item_id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    const result = await generateContentImage({
      prompt: prompt || item.image_prompt || "Creative social media visual",
      accountId: item.account_id,
      format: (image_format || item.image_format || "1:1") as ImageFormat,
      contentItemId: content_item_id,
      useBrandStyle: true,
    });

    // Update content item with new image
    const { data: updated, error: updateError } = await supabase
      .from("content_items")
      .update({
        image_storage_path: result.storagePath,
        image_public_url: result.publicUrl,
        image_prompt: result.enrichedPrompt,
        image_format: image_format || item.image_format,
        image_model: "nano-banana",
      })
      .eq("id", content_item_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Regenerate image error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
