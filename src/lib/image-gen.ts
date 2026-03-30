import { generateText, generateImage, analyzeImage } from "./gemini";
import { uploadFile } from "./storage";
import { getSupabase } from "./supabase";
import type { ImageFormat, Account } from "./types";

interface GenerateImageOptions {
  prompt: string;
  accountId: string;
  format?: ImageFormat;
  contentItemId?: string;
  useBrandStyle?: boolean;
  referenceImageBase64?: string;
}

interface GenerateImageResult {
  publicUrl: string;
  storagePath: string;
  enrichedPrompt: string;
  generationId: string;
}

async function getAccountContext(accountId: string): Promise<Account | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  return data;
}

async function getReferenceDescriptions(accountId: string): Promise<string[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("reference_images")
    .select("description")
    .eq("account_id", accountId)
    .eq("image_type", "reference")
    .not("description", "is", null)
    .limit(5);

  return (data || []).map((r) => r.description).filter(Boolean) as string[];
}

async function getLogoCount(accountId: string): Promise<number> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from("reference_images")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("image_type", "logo");

  return count || 0;
}

async function enrichPromptWithBrand(
  prompt: string,
  account: Account,
  referenceDescriptions: string[],
  logoCount: number = 0
): Promise<string> {
  const brandContext = [
    account.brand_style ? `Brand style: ${account.brand_style}` : "",
    account.color_palette?.length
      ? `Color palette: ${(account.color_palette as string[]).join(", ")}`
      : "",
    account.fonts ? `Brand fonts: ${account.fonts}` : "",
    logoCount > 0 ? `The brand has ${logoCount} logo variation(s) on file — maintain visual identity consistency` : "",
    referenceDescriptions.length
      ? `Reference style notes: ${referenceDescriptions.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!brandContext) return prompt;

  const enriched = await generateText(
    `You are an expert at crafting image generation prompts. Take the user's image idea and enhance it with the brand context provided. Output ONLY the enhanced prompt — no explanations, no quotes, just the prompt text.

BRAND CONTEXT:
${brandContext}

RULES:
- Keep the core idea from the user's prompt
- Incorporate the brand's visual style, colors, and aesthetic
- Be specific about composition, lighting, color usage
- Keep it under 200 words
- Do NOT include text/words in the image unless the user specifically asks for it`,
    `User's image idea: ${prompt}`,
    { model: "flash", maxTokens: 300 }
  );

  return enriched.trim();
}

export async function generateContentImage(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    prompt,
    accountId,
    format = "1:1",
    contentItemId,
    useBrandStyle = true,
    referenceImageBase64,
  } = options;

  // Step 1: Enrich prompt with brand context and/or reference image
  let finalPrompt = prompt;

  // If there's a one-time reference image, analyze it with vision
  if (referenceImageBase64) {
    const imageAnalysis = await analyzeImage(
      referenceImageBase64,
      `Analyze this reference image in detail. Describe: 1) Layout and composition (where elements are placed), 2) Color palette and background, 3) Typography style (bold, serif, sans-serif, size), 4) Overall design aesthetic (minimalist, editorial, corporate, etc), 5) Any graphic elements (icons, shapes, borders). The user wants to create something similar with this idea: "${prompt}". Be very specific and visual in your description, in 3-4 sentences.`,
      { maxTokens: 300 }
    );
    finalPrompt = `${prompt}\n\nIMPORTANT - Match this visual style closely: ${imageAnalysis}`;
  }

  if (useBrandStyle) {
    const account = await getAccountContext(accountId);
    if (account) {
      const [refs, logos] = await Promise.all([
        getReferenceDescriptions(accountId),
        getLogoCount(accountId),
      ]);
      finalPrompt = await enrichPromptWithBrand(finalPrompt, account, refs, logos);
    }
  }

  // Step 2: Generate image
  const imageBuffer = await generateImage(finalPrompt, { format });

  // Step 3: Upload to storage
  const imageId = crypto.randomUUID();
  const storagePath = `accounts/${accountId}/generated/${imageId}.png`;
  const publicUrl = await uploadFile(storagePath, imageBuffer, "image/png");

  // Step 4: Save generation record
  const supabase = getSupabase();

  // Mark previous generations for this content item as not current
  if (contentItemId) {
    await supabase
      .from("image_generations")
      .update({ is_current: false })
      .eq("content_item_id", contentItemId);
  }

  const { data: generation, error } = await supabase
    .from("image_generations")
    .insert({
      content_item_id: contentItemId || null,
      account_id: accountId,
      prompt: finalPrompt,
      format,
      model: "nano-banana",
      storage_path: storagePath,
      public_url: publicUrl,
      is_current: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save generation: ${error.message}`);

  return {
    publicUrl,
    storagePath,
    enrichedPrompt: finalPrompt,
    generationId: generation.id,
  };
}
