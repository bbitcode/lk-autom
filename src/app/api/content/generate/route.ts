import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateText } from "@/lib/gemini";
import { generateContentImage } from "@/lib/image-gen";
import { buildPlatformCopyPrompt, PLATFORMS } from "@/lib/platforms";
import { buildSystemPrompt } from "@/lib/prompts";
import type { Platform, ContentType, ImageFormat, Language } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      account_id,
      platform,
      content_type,
      copy_input,
      copy_language = "es",
      member_name,
      image_prompt,
      image_format,
      image_model: _image_model,
      use_brand_style = true,
      reference_image_base64,
    } = body as {
      account_id: string;
      platform: Platform;
      content_type: ContentType;
      copy_input?: string;
      copy_language?: Language;
      member_name?: string;
      image_prompt?: string;
      image_format?: ImageFormat;
      image_model?: string;
      use_brand_style?: boolean;
      reference_image_base64?: string;
    };

    if (!account_id || !platform || !content_type) {
      return NextResponse.json(
        { error: "account_id, platform, and content_type are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    let copyText: string | null = null;
    let imagePublicUrl: string | null = null;
    let imageStoragePath: string | null = null;
    let finalImagePrompt: string | null = null;
    const resolvedFormat = image_format || PLATFORMS[platform].defaultFormat;

    // Generate copy if needed
    if (content_type !== "image_only") {
      if (!copy_input) {
        return NextResponse.json({ error: "copy_input is required for copy generation" }, { status: 400 });
      }

      // Get account-specific company context and member profile for system prompt
      const { data: companyContext } = await supabase.from("company_context").select("*").eq("account_id", account_id);
      let memberProfile = null;
      if (member_name) {
        const { data } = await supabase
          .from("team_members")
          .select("*")
          .eq("name", member_name)
          .single();
        memberProfile = data;
      }

      const { data: ratedPosts } = await supabase
        .from("posts")
        .select("content_en, content_es, rating")
        .gte("rating", 4)
        .not("rating", "is", null);

      const ratedExamples = (ratedPosts || [])
        .map((p) => ({
          content: ((p.content_en || p.content_es || "") as string).slice(0, 1500),
          rating: p.rating as number,
        }))
        .filter((e) => e.content.length > 0);

      const systemPrompt = buildSystemPrompt(companyContext || [], memberProfile, ratedExamples);
      const userPrompt = buildPlatformCopyPrompt(platform, copy_input, copy_language);

      copyText = await generateText(systemPrompt, userPrompt);
    }

    // Generate image if needed
    if (content_type !== "copy_only") {
      const promptForImage = image_prompt || copy_input || "Creative social media visual";

      const result = await generateContentImage({
        prompt: promptForImage,
        accountId: account_id,
        format: resolvedFormat as ImageFormat,
        useBrandStyle: use_brand_style,
        referenceImageBase64: reference_image_base64,
      });

      imagePublicUrl = result.publicUrl;
      imageStoragePath = result.storagePath;
      finalImagePrompt = result.enrichedPrompt;
    }

    // Save content item
    const { data: contentItem, error } = await supabase
      .from("content_items")
      .insert({
        account_id,
        platform,
        content_type,
        copy_text: copyText,
        copy_language: content_type !== "image_only" ? copy_language : null,
        image_storage_path: imageStoragePath,
        image_public_url: imagePublicUrl,
        image_format: content_type !== "copy_only" ? resolvedFormat : null,
        image_model: content_type !== "copy_only" ? "nano-banana" : null,
        image_prompt: finalImagePrompt,
        status: "draft",
        tags: [],
        generated_by: "web",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Link image generation to content item
    if (imageStoragePath) {
      await supabase
        .from("image_generations")
        .update({ content_item_id: contentItem.id })
        .eq("storage_path", imageStoragePath);
    }

    return NextResponse.json(contentItem);
  } catch (error) {
    console.error("Content generate error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
