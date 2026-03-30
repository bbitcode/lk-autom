import { generateText, generateImage } from "./gemini";
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

// Fetch actual image files (logos + references) from storage for the account
async function getAccountImages(
  accountId: string,
  type: "logo" | "reference"
): Promise<{ data: string; mimeType: string }[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("reference_images")
    .select("public_url")
    .eq("account_id", accountId)
    .eq("image_type", type)
    .order("created_at", { ascending: false })
    .limit(type === "logo" ? 3 : 3);

  if (!data?.length) return [];

  const images: { data: string; mimeType: string }[] = [];
  for (const ref of data) {
    try {
      const response = await fetch(ref.public_url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/png";
      images.push({
        data: buffer.toString("base64"),
        mimeType: contentType,
      });
    } catch {
      // Skip images that can't be fetched
    }
  }
  return images;
}

function buildBrandPrompt(account: Account): string {
  const parts = [
    account.brand_style ? `Brand style: ${account.brand_style}` : "",
    account.color_palette?.length
      ? `Color palette: ${(account.color_palette as string[]).join(", ")}`
      : "",
    account.fonts ? `Brand fonts: ${account.fonts}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n") : "";
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

  // Collect all reference images to pass directly to the model
  const referenceImages: { data: string; mimeType: string }[] = [];
  let finalPrompt = prompt;

  // Add one-time reference image from user
  if (referenceImageBase64) {
    referenceImages.push({
      data: referenceImageBase64,
      mimeType: "image/png",
    });
  }

  if (useBrandStyle) {
    const account = await getAccountContext(accountId);
    if (account) {
      // Fetch actual logo and reference images to pass to the model
      const [logos, refs] = await Promise.all([
        getAccountImages(accountId, "logo"),
        getAccountImages(accountId, "reference"),
      ]);

      referenceImages.push(...logos, ...refs);

      // Build text context for brand style, colors, fonts
      const brandContext = buildBrandPrompt(account);

      if (brandContext || referenceImages.length > 0) {
        const contextParts = [];
        if (brandContext) contextParts.push(brandContext);
        if (logos.length > 0) contextParts.push(`I've attached ${logos.length} logo(s) — incorporate the brand's visual identity.`);
        if (refs.length > 0) contextParts.push(`I've attached ${refs.length} reference image(s) — match their visual style, composition, and aesthetic closely.`);
        if (referenceImageBase64) contextParts.push("The first attached image is the primary reference — match its style as closely as possible.");

        finalPrompt = `${prompt}\n\nBRAND GUIDELINES:\n${contextParts.join("\n")}`;
      }
    }
  } else if (referenceImageBase64) {
    finalPrompt = `${prompt}\n\nI've attached a reference image — match its visual style, composition, and aesthetic closely.`;
  }

  // Generate image with Gemini native (can see all reference images)
  const imageBuffer = await generateImage(finalPrompt, {
    format,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
  });

  // Upload to storage
  const imageId = crypto.randomUUID();
  const storagePath = `accounts/${accountId}/generated/${imageId}.png`;
  const publicUrl = await uploadFile(storagePath, imageBuffer, "image/png");

  // Save generation record
  const supabase = getSupabase();

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
