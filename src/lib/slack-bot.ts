import { getSupabase } from "./supabase";
import {
  buildSystemPrompt,
  buildGenerateFromUrlPrompt,
  buildGenerateFromIdeaPrompt,
} from "./prompts";
import { getCachedArticles, fetchAndCacheNews } from "./discover";
import { generateText } from "./gemini";
import { generateContentImage } from "./image-gen";
import { buildPlatformCopyPrompt } from "./platforms";
import { uploadFile } from "./storage";
import {
  createPost as postsyncerCreatePost,
  listAccounts as postsyncerListAccounts,
  getPost as postsyncerGetPost,
  getActiveWorkspaceId,
  type PostsyncerAccount,
} from "./postsyncer";
import type { ImageFormat, Language, Platform } from "./types";

interface SlackAction {
  intent:
    | "generate_from_url"
    | "generate_from_idea"
    | "discover_news"
    | "refine_post"
    | "list_posts"
    | "general_chat"
    | "generate_image"
    | "generate_content"
    | "set_account"
    | "list_accounts"
    | "upload_reference"
    | "delete_image"
    | "list_images"
    | "approve_post"
    | "list_social_accounts"
    | "publish_post"
    | "post_status";
  url?: string;
  idea?: string;
  member_name?: string;
  instruction?: string;
  post_id?: string;
  focus?: string;
  status_filter?: string;
  account_slug?: string;
  platform?: Platform;
  image_prompt?: string;
  image_format?: ImageFormat;
  image_model?: string;
  content_item_id?: string;
  publish_target?: string; // "linkedin" | "x" | "twitter" | "ambas" | comma-separated account ids
  publish_language?: Language;
  publish_when?: string; // raw user-provided datetime
}

const TEAM_MEMBERS = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

function parseJsonFromResponse(text: string): Record<string, string> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// --- Account context helpers ---

async function getActiveAccountId(channelId: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("slack_channel_config")
    .select("active_account_id")
    .eq("channel_id", channelId)
    .single();

  if (data?.active_account_id) return data.active_account_id;

  // Fall back to default account
  const { data: defaultAccount } = await supabase
    .from("accounts")
    .select("id")
    .eq("is_default", true)
    .single();

  return defaultAccount?.id || "";
}

async function setActiveAccount(channelId: string, slug: string): Promise<string> {
  const supabase = getSupabase();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!account) return `No encontré la cuenta con slug \`${slug}\`. Usa \`/cuentas\` para ver las disponibles.`;

  await supabase
    .from("slack_channel_config")
    .upsert({ channel_id: channelId, active_account_id: account.id }, { onConflict: "channel_id" });

  return `Cuenta activa cambiada a *${account.name}*.`;
}

// --- Intent interpreter ---

export async function interpretMessage(text: string): Promise<SlackAction> {
  const responseText = await generateText(
    `You are a router for a Slack bot. Analyze the user message and determine the intent.

Available intents:
- "generate_from_url": Generate a LinkedIn post from a URL.
- "generate_from_idea": Generate a LinkedIn post from an idea.
- "discover_news": Show latest relevant news/articles.
- "refine_post": Edit/refine an existing post. Needs post_id and instruction.
- "list_posts": Show existing posts. May filter by status.
- "generate_image": Generate an image. Extract the prompt.
- "generate_content": Generate copy + image for a platform (instagram, twitter, linkedin).
- "set_account": Switch the active brand/account.
- "list_accounts": List available accounts/brands.
- "list_images": Show recent generated images.
- "delete_image": Delete a generated image by ID.
- "approve_post": Approve a post for publishing. Needs post_id.
- "list_social_accounts": List connected social accounts in PostSyncer (LinkedIn, X, etc).
- "publish_post": Publish/schedule a post via PostSyncer. Needs post_id, publish_target (linkedin/x/ambas or numeric ids), publish_language (en/es), optional publish_when.
- "post_status": Check publishing status of a post. Needs post_id.
- "general_chat": General question or conversation.

Team members: ${TEAM_MEMBERS.join(", ")}

Return ONLY valid JSON:
{
  "intent": "...",
  "url": "extracted URL if any",
  "idea": "the idea/topic",
  "member_name": "team member name if mentioned",
  "instruction": "refinement instruction",
  "post_id": "post ID if mentioned",
  "focus": "specific angle/focus",
  "status_filter": "draft/ready/used",
  "account_slug": "account slug if switching",
  "platform": "linkedin/instagram/twitter if mentioned",
  "image_prompt": "image description if generating image",
  "image_format": "1:1/4:5/9:16/16:9 if specified",
  "image_model": "nano-banana",
  "content_item_id": "content item ID if mentioned",
  "publish_target": "linkedin/x/ambas/account-id if publishing",
  "publish_language": "en/es if publishing",
  "publish_when": "natural date/time string if scheduling"
}`,
    text,
    { model: "flash", maxTokens: 500 }
  );

  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) return { intent: "general_chat" };

  try {
    return JSON.parse(match[0]) as SlackAction;
  } catch {
    return { intent: "general_chat" };
  }
}

// --- Existing handlers (unchanged) ---

async function scrapeUrl(url: string): Promise<string> {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Failed to scrape URL");
  return (data.data?.markdown || "").slice(0, 8000);
}

export async function handleGenerateFromUrl(url: string, memberName?: string, focus?: string): Promise<string> {
  const supabase = getSupabase();
  const { data: companyContext } = await supabase.from("company_context").select("*");
  let memberProfile = null;
  if (memberName) {
    const { data } = await supabase.from("team_members").select("*").eq("name", memberName).single();
    memberProfile = data;
  }
  const { data: ratedPosts } = await supabase.from("posts").select("content_en, content_es, rating").gte("rating", 4).not("rating", "is", null);
  const ratedExamples = (ratedPosts || []).map((p) => ({ content: ((p.content_en || p.content_es || "") as string).slice(0, 1500), rating: p.rating as number })).filter((e) => e.content.length > 0);
  const systemPrompt = buildSystemPrompt(companyContext || [], memberProfile, ratedExamples);
  const scrapedContent = await scrapeUrl(url);
  const userPrompt = buildGenerateFromUrlPrompt(url, scrapedContent, focus);
  const responseText = await generateText(systemPrompt, userPrompt);
  const generated = parseJsonFromResponse(responseText);
  if (!generated) throw new Error("Failed to parse AI response: " + responseText.slice(0, 200));
  const { data: post, error } = await supabase.from("posts").insert({ content_en: generated.content_en || null, content_es: generated.content_es || null, source_url: url, source_summary: generated.source_summary || null, status: "draft", tags: [] }).select().single();
  if (error) throw new Error(error.message);
  let result = `*Post generado desde URL* (ID: \`${post.id}\`)\n`;
  if (post.content_en) result += `\n*English:*\n${post.content_en}\n`;
  if (post.content_es) result += `\n*Español:*\n${post.content_es}\n`;
  if (post.source_summary) result += `\n_Fuente: ${post.source_summary}_`;
  return result;
}

export async function handleGenerateFromIdea(idea: string, memberName?: string): Promise<string> {
  const supabase = getSupabase();
  const { data: companyContext } = await supabase.from("company_context").select("*");
  let memberProfile = null;
  if (memberName) {
    const { data } = await supabase.from("team_members").select("*").eq("name", memberName).single();
    memberProfile = data;
  }
  const { data: ratedPosts } = await supabase.from("posts").select("content_en, content_es, rating").gte("rating", 4).not("rating", "is", null);
  const ratedExamples = (ratedPosts || []).map((p) => ({ content: ((p.content_en || p.content_es || "") as string).slice(0, 1500), rating: p.rating as number })).filter((e) => e.content.length > 0);
  const systemPrompt = buildSystemPrompt(companyContext || [], memberProfile, ratedExamples);
  const userPrompt = buildGenerateFromIdeaPrompt(idea);
  const responseText = await generateText(systemPrompt, userPrompt);
  const generated = parseJsonFromResponse(responseText);
  if (!generated) throw new Error("Failed to parse AI response: " + responseText.slice(0, 200));
  const { data: post, error } = await supabase.from("posts").insert({ content_en: generated.content_en || null, content_es: generated.content_es || null, source_url: null, source_summary: null, status: "draft", tags: [] }).select().single();
  if (error) throw new Error(error.message);
  let result = `*Post generado desde idea* (ID: \`${post.id}\`)\n`;
  if (post.content_en) result += `\n*English:*\n${post.content_en}\n`;
  if (post.content_es) result += `\n*Español:*\n${post.content_es}\n`;
  return result;
}

export async function handleDiscoverNews(): Promise<string> {
  let articles = await getCachedArticles();
  if (!articles || articles.length === 0) articles = await fetchAndCacheNews();
  if (!articles || articles.length === 0) return "No encontré noticias relevantes en este momento.";
  const top = articles.slice(0, 10);
  let result = "*Noticias relevantes:*\n\n";
  for (const article of top) {
    result += `• *${article.title}* (${article.source}, score: ${article.relevance_score}/10)\n  ${article.link}\n\n`;
  }
  result += "_Tip: Pega cualquier URL y te genero un post basado en la noticia._";
  return result;
}

export async function handleRefinePost(postId: string, instruction: string): Promise<string> {
  const supabase = getSupabase();
  const { data: post, error } = await supabase.from("posts").select("*").eq("id", postId).single();
  if (error || !post) return `No encontré el post con ID \`${postId}\`.`;
  const responseText = await generateText(
    "You rewrite LinkedIn posts based on user instructions. Keep the same general topic but adjust based on the instruction. Do NOT mention or promote Aloud unless the user explicitly asks for it.",
    `ENGLISH:\n${post.content_en || "N/A"}\n\nSPANISH:\n${post.content_es || "N/A"}\n\nINSTRUCTION: ${instruction}\n\nRewrite both versions. Format as JSON:\n{"content_en": "...", "content_es": "..."}`
  );
  const generated = parseJsonFromResponse(responseText);
  if (!generated) throw new Error("Failed to parse AI response: " + responseText.slice(0, 200));
  const { data: updated, error: updateError } = await supabase.from("posts").update({ content_en: generated.content_en || post.content_en, content_es: generated.content_es || post.content_es }).eq("id", postId).select().single();
  if (updateError) throw new Error(updateError.message);
  let result = `*Post refinado* (ID: \`${updated.id}\`)\n`;
  if (updated.content_en) result += `\n*English:*\n${updated.content_en}\n`;
  if (updated.content_es) result += `\n*Español:*\n${updated.content_es}\n`;
  return result;
}

export async function handleListPosts(statusFilter?: string): Promise<string> {
  const supabase = getSupabase();
  let query = supabase.from("posts").select("id, content_en, content_es, status, used_by, rating, created_at").order("created_at", { ascending: false }).limit(5);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return "No hay posts" + (statusFilter ? ` con estado "${statusFilter}"` : "") + ".";
  let result = `*Últimos posts${statusFilter ? ` (${statusFilter})` : ""}:*\n\n`;
  for (const post of data) {
    const preview = ((post.content_es || post.content_en || "") as string).slice(0, 100);
    const rating = post.rating ? ` | ${post.rating}/5` : "";
    const assignee = post.used_by ? ` | ${post.used_by}` : "";
    result += `• \`${post.id.slice(0, 8)}\` [${post.status}${rating}${assignee}]\n  _${preview}..._\n\n`;
  }
  return result;
}

export async function handleGeneralChat(userMessage: string): Promise<string> {
  const supabase = getSupabase();
  const { data: companyContext } = await supabase.from("company_context").select("*");
  const contextMap = Object.fromEntries((companyContext || []).map((c) => [c.key, c.value]));
  return await generateText(
    `You are the Aloud Content Lab assistant on Slack. You help the team with content strategy.\n\nCompany context:\n- What we do: ${contextMap.company_description || "N/A"}\n- Services: ${contextMap.services || "N/A"}\n- Target audience: ${contextMap.target_audience || "N/A"}\n\nRespond in the same language the user writes in. Be concise and conversational.`,
    userMessage,
    { maxTokens: 1000 }
  );
}

// --- NEW handlers ---

export async function handleGenerateImage(
  prompt: string,
  channelId: string,
  format?: ImageFormat,
  accountSlug?: string
): Promise<{ text: string; imageBuffer?: Buffer }> {
  const supabase = getSupabase();

  let accountId: string;
  if (accountSlug) {
    const { data } = await supabase.from("accounts").select("id").eq("slug", accountSlug).single();
    if (!data) return { text: `No encontré la cuenta \`${accountSlug}\`. Usa \`/cuentas\` para ver las disponibles.` };
    accountId = data.id;
  } else {
    accountId = await getActiveAccountId(channelId);
  }

  if (!accountId) return { text: "No hay cuenta activa. Usa `/cuenta [slug]` para seleccionar una." };

  const result = await generateContentImage({
    prompt,
    accountId,
    format: format || "1:1",
    useBrandStyle: true,
  });

  // Save as content item
  const { data: item } = await supabase
    .from("content_items")
    .insert({
      account_id: accountId,
      platform: "instagram",
      content_type: "image_only",
      image_storage_path: result.storagePath,
      image_public_url: result.publicUrl,
      image_format: format || "1:1",
      image_model: "nano-banana",
      image_prompt: result.enrichedPrompt,
      status: "draft",
      tags: [],
      generated_by: "slack",
    })
    .select()
    .single();

  // Link generation to content item
  if (item) {
    await supabase.from("image_generations").update({ content_item_id: item.id }).eq("id", result.generationId);
  }

  // Return image buffer for Slack upload
  const imageResponse = await fetch(result.publicUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  return {
    text: `*Imagen generada* (ID: \`${item?.id?.slice(0, 8) || "?"}\`)\nPrompt: _${result.enrichedPrompt.slice(0, 150)}..._`,
    imageBuffer,
  };
}

export async function handleGenerateContent(
  idea: string,
  channelId: string,
  platform: Platform = "instagram",
  format?: ImageFormat,
): Promise<{ text: string; imageBuffer?: Buffer }> {
  const accountId = await getActiveAccountId(channelId);
  if (!accountId) return { text: "No hay cuenta activa. Usa `/cuenta [slug]` para seleccionar una." };

  const supabase = getSupabase();

  // Generate copy
  const { data: companyContext } = await supabase.from("company_context").select("*");
  const systemPrompt = buildSystemPrompt(companyContext || [], null, []);
  const copyPrompt = buildPlatformCopyPrompt(platform, idea, "es");
  const copyText = await generateText(systemPrompt, copyPrompt);

  // Generate image
  const imgResult = await generateContentImage({
    prompt: idea,
    accountId,
    format: format || "1:1",
    useBrandStyle: true,
  });

  // Save content item
  const { data: item } = await supabase
    .from("content_items")
    .insert({
      account_id: accountId,
      platform,
      content_type: "copy_and_image",
      copy_text: copyText,
      copy_language: "es",
      image_storage_path: imgResult.storagePath,
      image_public_url: imgResult.publicUrl,
      image_format: format || "1:1",
      image_model: "nano-banana",
      image_prompt: imgResult.enrichedPrompt,
      status: "draft",
      tags: [],
      generated_by: "slack",
    })
    .select()
    .single();

  if (item) {
    await supabase.from("image_generations").update({ content_item_id: item.id }).eq("id", imgResult.generationId);
  }

  const imageResponse = await fetch(imgResult.publicUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  return {
    text: `*Contenido generado para ${platform}* (ID: \`${item?.id?.slice(0, 8) || "?"}\`)\n\n*Copy:*\n${copyText}`,
    imageBuffer,
  };
}

export async function handleListAccounts(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase.from("accounts").select("name, slug, is_default").order("name");
  if (!data || data.length === 0) return "No hay cuentas creadas.";
  let result = "*Cuentas disponibles:*\n\n";
  for (const a of data) {
    result += `• *${a.name}* (\`${a.slug}\`)${a.is_default ? " — default" : ""}\n`;
  }
  result += "\n_Usa `/cuenta [slug]` para cambiar la cuenta activa._";
  return result;
}

export async function handleListImages(channelId: string): Promise<string> {
  const accountId = await getActiveAccountId(channelId);
  const supabase = getSupabase();
  const { data } = await supabase
    .from("content_items")
    .select("id, platform, image_format, image_model, status, created_at, image_prompt")
    .eq("account_id", accountId)
    .not("image_public_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "No hay imágenes generadas para esta cuenta.";

  let result = "*Últimas imágenes:*\n\n";
  for (const item of data) {
    const prompt = (item.image_prompt || "").slice(0, 80);
    result += `• \`${item.id.slice(0, 8)}\` [${item.platform} | ${item.image_format} | ${item.image_model}] ${item.status}\n  _${prompt}..._\n\n`;
  }
  return result;
}

export async function handleDeleteImage(contentItemId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: item } = await supabase
    .from("content_items")
    .select("id, image_storage_path")
    .eq("id", contentItemId)
    .single();

  if (!item) {
    // Try partial ID match
    const { data: items } = await supabase
      .from("content_items")
      .select("id, image_storage_path")
      .like("id", `${contentItemId}%`)
      .limit(1);
    if (!items || items.length === 0) return `No encontré contenido con ID \`${contentItemId}\`.`;
    const found = items[0];
    await supabase.from("content_items").delete().eq("id", found.id);
    return `Contenido \`${found.id.slice(0, 8)}\` eliminado.`;
  }

  await supabase.from("content_items").delete().eq("id", item.id);
  return `Contenido \`${item.id.slice(0, 8)}\` eliminado.`;
}

export async function handleUploadReference(
  fileBuffer: Buffer,
  fileName: string,
  channelId: string,
  description?: string
): Promise<string> {
  const accountId = await getActiveAccountId(channelId);
  if (!accountId) return "No hay cuenta activa. Usa `/cuenta [slug]` primero.";

  const ext = fileName.split(".").pop() || "png";
  const imageId = crypto.randomUUID();
  const storagePath = `accounts/${accountId}/references/${imageId}.${ext}`;
  const publicUrl = await uploadFile(storagePath, fileBuffer, `image/${ext}`);

  const supabase = getSupabase();
  await supabase.from("reference_images").insert({
    account_id: accountId,
    storage_path: storagePath,
    public_url: publicUrl,
    description: description || null,
    uploaded_via: "slack",
  });

  return `Imagen de referencia guardada para la cuenta activa. ${description ? `Descripción: "${description}"` : ""}`;
}

// --- PostSyncer handlers ---

// Bogota is fixed UTC-5 (no DST). Accepts "YYYY-MM-DD HH:MM", ISO, or with offset.
function parseScheduleTime(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(/\s+/, "T");
  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized);
  const candidate = hasOffset ? normalized : `${normalized}-05:00`;
  const date = new Date(candidate);
  if (isNaN(date.getTime())) throw new Error(`Fecha inválida: "${input}". Usa formato "2026-04-28 10:00".`);
  return date.toISOString();
}

function resolveTargetAccountIds(
  target: string,
  accounts: PostsyncerAccount[]
): { ids: number[]; resolved: PostsyncerAccount[]; error?: string } {
  const lower = target.toLowerCase().trim();

  // Numeric / comma-separated ids
  if (/^[\d,\s]+$/.test(target)) {
    const ids = target.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    const resolved = accounts.filter((a) => ids.includes(a.id));
    if (resolved.length !== ids.length) {
      const missing = ids.filter((id) => !resolved.find((a) => a.id === id));
      return { ids: [], resolved: [], error: `IDs no encontrados: ${missing.join(", ")}` };
    }
    return { ids, resolved };
  }

  const platformMap: Record<string, string[]> = {
    linkedin: ["linkedin"],
    x: ["twitter"],
    twitter: ["twitter"],
    ambas: ["linkedin", "twitter"],
    ambos: ["linkedin", "twitter"],
  };
  const platforms = platformMap[lower];
  if (!platforms) {
    return { ids: [], resolved: [], error: `Target inválido: "${target}". Usa linkedin, x, ambas, o IDs (ver \`/redes\`).` };
  }

  const matched = accounts.filter((a) => platforms.includes(a.platform) && !a.has_expired);
  if (matched.length === 0) {
    return { ids: [], resolved: [], error: `No hay cuentas conectadas para: ${platforms.join(", ")}.` };
  }

  // If multiple accounts match a single platform, prefer is_default; otherwise require user to pick.
  if (lower === "linkedin" || lower === "x" || lower === "twitter") {
    const platform = platforms[0];
    const ofPlatform = matched.filter((a) => a.platform === platform);
    if (ofPlatform.length > 1) {
      const defaults = ofPlatform.filter((a) => a.is_default);
      if (defaults.length === 1) {
        return { ids: [defaults[0].id], resolved: defaults };
      }
      const list = ofPlatform.map((a) => `\`${a.id}\` ${a.name}${a.username ? ` (@${a.username})` : ""}`).join(", ");
      return {
        ids: [],
        resolved: [],
        error: `Hay varias cuentas de ${platform}. Especifica el ID con \`--cuenta [id]\` o pásalo directo: ${list}`,
      };
    }
    return { ids: ofPlatform.map((a) => a.id), resolved: ofPlatform };
  }

  // ambas: pick one of each platform (default if available, else first)
  const ids: number[] = [];
  const resolved: PostsyncerAccount[] = [];
  for (const platform of platforms) {
    const ofPlatform = matched.filter((a) => a.platform === platform);
    if (ofPlatform.length === 0) continue;
    const pick = ofPlatform.find((a) => a.is_default) || ofPlatform[0];
    ids.push(pick.id);
    resolved.push(pick);
  }
  return { ids, resolved };
}

export async function handleApprovePost(postId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: post, error } = await supabase.from("posts").select("id, status").eq("id", postId).single();
  if (error || !post) return `No encontré el post con ID \`${postId}\`.`;
  if (post.status === "used") return `El post \`${postId}\` ya fue publicado.`;
  if (post.status === "ready") return `El post \`${postId}\` ya estaba aprobado.`;

  const { error: updateError } = await supabase
    .from("posts")
    .update({ status: "ready", approved_at: new Date().toISOString(), approved_by: "slack" })
    .eq("id", postId);
  if (updateError) throw new Error(updateError.message);

  return `*Post aprobado* \`${postId}\` ✅\nUsa \`/publicar ${postId} [linkedin|x|ambas] --idioma [en|es]\` para publicar.`;
}

export async function handleListSocialAccounts(): Promise<string> {
  const accounts = await postsyncerListAccounts();
  if (accounts.length === 0) return "No hay cuentas conectadas en PostSyncer.";

  const byPlatform = new Map<string, PostsyncerAccount[]>();
  for (const a of accounts) {
    const list = byPlatform.get(a.platform) || [];
    list.push(a);
    byPlatform.set(a.platform, list);
  }

  let result = "*Cuentas conectadas en PostSyncer:*\n\n";
  for (const [platform, list] of byPlatform) {
    result += `*${platform}*\n`;
    for (const a of list) {
      const flags = [a.is_default ? "default" : "", a.has_expired ? "⚠️ expirada" : ""].filter(Boolean).join(", ");
      result += `• \`${a.id}\` ${a.name}${a.username ? ` (@${a.username})` : ""}${flags ? ` — ${flags}` : ""}\n`;
    }
    result += "\n";
  }
  return result;
}

export async function handlePublishPost(
  postId: string,
  target: string | undefined,
  language: Language | undefined,
  when: string | undefined
): Promise<string> {
  if (!target) return "Necesito el destino. Ejemplo: `/publicar abc123 linkedin --idioma es`";
  if (!language) return "¿En qué idioma? Agrega `--idioma en` o `--idioma es`.";

  const supabase = getSupabase();
  const { data: post, error } = await supabase.from("posts").select("*").eq("id", postId).single();
  if (error || !post) return `No encontré el post con ID \`${postId}\`.`;
  if (post.status !== "ready") {
    return `El post \`${postId}\` está en estado \`${post.status}\`. Apruébalo primero con \`/aprobar ${postId}\`.`;
  }

  const text = language === "en" ? post.content_en : post.content_es;
  if (!text) return `El post \`${postId}\` no tiene contenido en ${language === "en" ? "inglés" : "español"}.`;

  const accounts = await postsyncerListAccounts();
  const { ids, resolved, error: targetError } = resolveTargetAccountIds(target, accounts);
  if (targetError) return targetError;

  let scheduledAt: string | undefined;
  if (when) {
    try {
      scheduledAt = parseScheduleTime(when);
    } catch (e) {
      return e instanceof Error ? e.message : "Fecha inválida.";
    }
  }

  const created = await postsyncerCreatePost({
    workspaceId: getActiveWorkspaceId(),
    accountIds: ids,
    text,
    scheduleType: scheduledAt ? "schedule" : "publish_now",
    scheduledAt,
  });

  const platforms = Array.from(new Set(resolved.map((a) => a.platform)));
  await supabase
    .from("posts")
    .update({
      status: "used",
      postsyncer_post_id: String(created.id ?? ""),
      postsyncer_account_ids: ids,
      published_to: platforms,
      scheduled_at: scheduledAt || null,
      publish_language: language,
    })
    .eq("id", postId);

  const accountList = resolved.map((a) => `${a.platform}/${a.name}`).join(", ");
  const when_msg = scheduledAt ? `agendado para ${scheduledAt}` : "publicado ahora";
  return `*Post enviado a PostSyncer* (ID PostSyncer: \`${created.id}\`)\n• Cuentas: ${accountList}\n• ${when_msg}\n• Idioma: ${language}`;
}

export async function handlePostStatus(postId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: post, error } = await supabase
    .from("posts")
    .select("id, status, postsyncer_post_id, published_to, scheduled_at, publish_language, approved_at")
    .eq("id", postId)
    .single();
  if (error || !post) return `No encontré el post con ID \`${postId}\`.`;

  let result = `*Post \`${postId}\`*\n• Estado local: ${post.status}\n`;
  if (post.approved_at) result += `• Aprobado: ${post.approved_at}\n`;
  if (post.published_to?.length) result += `• Plataformas: ${post.published_to.join(", ")}\n`;
  if (post.publish_language) result += `• Idioma: ${post.publish_language}\n`;
  if (post.scheduled_at) result += `• Agendado: ${post.scheduled_at}\n`;

  if (post.postsyncer_post_id) {
    try {
      const remote = await postsyncerGetPost(post.postsyncer_post_id);
      result += `\n*Estado en PostSyncer:*\n• ID: \`${remote.id}\`\n`;
      if (remote.status) result += `• Status: ${remote.status}\n`;
      if (remote.published_at) result += `• Publicado: ${remote.published_at}\n`;
      if (remote.scheduled_at) result += `• Agendado: ${remote.scheduled_at}\n`;
    } catch (e) {
      result += `\n_No pude consultar PostSyncer: ${e instanceof Error ? e.message : "error"}_`;
    }
  } else {
    result += "\n_Aún no enviado a PostSyncer._";
  }
  return result;
}

// --- Command parser ---

function parseCommand(text: string): SlackAction | null {
  // Existing commands
  const generateMatch = text.match(/^\/generar\s+(https?:\/\/\S+)(?:\s+para\s+(\w+))?/i);
  if (generateMatch) {
    return { intent: "generate_from_url", url: generateMatch[1], member_name: generateMatch[2] && TEAM_MEMBERS.includes(generateMatch[2]) ? generateMatch[2] : undefined };
  }

  const ideaMatch = text.match(/^\/idea\s+(.+?)(?:\s+para\s+(\w+)\s*$)?/i);
  if (ideaMatch) {
    return { intent: "generate_from_idea", idea: ideaMatch[1].trim(), member_name: ideaMatch[2] && TEAM_MEMBERS.includes(ideaMatch[2]) ? ideaMatch[2] : undefined };
  }

  if (/^\/noticias\s*$/i.test(text)) return { intent: "discover_news" };

  const refineMatch = text.match(/^\/refinar\s+([a-f0-9-]+)\s+(.+)/i);
  if (refineMatch) return { intent: "refine_post", post_id: refineMatch[1], instruction: refineMatch[2].trim() };

  const postsMatch = text.match(/^\/posts(?:\s+(draft|ready|used))?\s*$/i);
  if (postsMatch) return { intent: "list_posts", status_filter: postsMatch[1]?.toLowerCase() };

  if (/^\/ayuda\s*$/i.test(text)) return { intent: "general_chat" };

  // NEW commands
  const imagenMatch = text.match(/^\/imagen\s+(.+)/i);
  if (imagenMatch) {
    const args = imagenMatch[1];
    const formatMatch = args.match(/--formato\s+([\d:]+)/i);
    const modelMatch = args.match(/--modelo\s+([\w-]+)/i);
    const cuentaMatch = args.match(/--cuenta\s+([\w-]+)/i);
    const prompt = args.replace(/--formato\s+[\d:]+/gi, "").replace(/--modelo\s+[\w-]+/gi, "").replace(/--cuenta\s+[\w-]+/gi, "").trim();
    return {
      intent: "generate_image",
      image_prompt: prompt,
      image_format: (formatMatch?.[1] as ImageFormat) || undefined,
      image_model: "nano-banana",
      account_slug: cuentaMatch?.[1],
    };
  }

  const contenidoMatch = text.match(/^\/contenido\s+(.+)/i);
  if (contenidoMatch) {
    const args = contenidoMatch[1];
    const platMatch = args.match(/--plataforma\s+(\w+)/i);
    const formatMatch = args.match(/--formato\s+([\d:]+)/i);
    const modelMatch = args.match(/--modelo\s+([\w-]+)/i);
    const idea = args.replace(/--plataforma\s+\w+/gi, "").replace(/--formato\s+[\d:]+/gi, "").replace(/--modelo\s+[\w-]+/gi, "").trim();
    return {
      intent: "generate_content",
      idea,
      platform: (platMatch?.[1] as Platform) || undefined,
      image_format: (formatMatch?.[1] as ImageFormat) || undefined,
      image_model: "nano-banana",
    };
  }

  const cuentaMatch = text.match(/^\/cuenta\s+([\w-]+)\s*$/i);
  if (cuentaMatch) return { intent: "set_account", account_slug: cuentaMatch[1] };

  if (/^\/cuentas\s*$/i.test(text)) return { intent: "list_accounts" };
  if (/^\/imagenes\s*$/i.test(text)) return { intent: "list_images" };

  const borrarMatch = text.match(/^\/borrar-imagen\s+([a-f0-9-]+)/i);
  if (borrarMatch) return { intent: "delete_image", content_item_id: borrarMatch[1] };

  // PostSyncer commands
  const aprobarMatch = text.match(/^\/aprobar\s+([a-f0-9-]+)\s*$/i);
  if (aprobarMatch) return { intent: "approve_post", post_id: aprobarMatch[1] };

  if (/^\/redes\s*$/i.test(text)) return { intent: "list_social_accounts" };

  const estadoMatch = text.match(/^\/estado\s+([a-f0-9-]+)\s*$/i);
  if (estadoMatch) return { intent: "post_status", post_id: estadoMatch[1] };

  const publicarMatch = text.match(/^\/publicar\s+(.+)/i);
  if (publicarMatch) {
    const args = publicarMatch[1];
    const cuandoMatch = args.match(/--cuando\s+(?:"([^"]+)"|(\S+))/i);
    const idiomaMatch = args.match(/--idioma\s+(en|es)/i);
    const cuentaMatch = args.match(/--cuenta\s+([\d,\s]+?)(?=\s--|$)/i);
    const cleaned = args
      .replace(/--cuando\s+(?:"[^"]+"|\S+)/gi, "")
      .replace(/--idioma\s+(?:en|es)/gi, "")
      .replace(/--cuenta\s+[\d,\s]+/gi, "")
      .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    return {
      intent: "publish_post",
      post_id: parts[0],
      publish_target: cuentaMatch?.[1]?.trim() || parts[1],
      publish_language: (idiomaMatch?.[1].toLowerCase() as Language) || undefined,
      publish_when: cuandoMatch?.[1] || cuandoMatch?.[2],
    };
  }

  return null;
}

// --- Help message ---

const HELP_MESSAGE = `*Comandos disponibles:*

*Texto (LinkedIn):*
• \`/generar [URL]\` — Post desde un artículo
• \`/generar [URL] para Daniel\` — Con tono de un miembro
• \`/idea [texto]\` — Post desde una idea
• \`/refinar [ID] [instrucción]\` — Refina un post
• \`/posts\` — Lista posts (filtrar: \`/posts draft\`)

*Imágenes:*
• \`/imagen [prompt]\` — Genera imagen
• \`/imagen [prompt] --formato 16:9\` — Con formato
• \`/imagen [prompt] --modelo nano-banana\` — Con modelo
• \`/imagen [prompt] --cuenta aloud\` — Para una cuenta específica
• \`/imagenes\` — Lista imágenes recientes
• \`/borrar-imagen [ID]\` — Elimina una imagen

*Contenido (copy + imagen):*
• \`/contenido [idea] --plataforma instagram\` — Copy + imagen
• \`/contenido [idea] --plataforma twitter --formato 16:9\`

*Cuentas:*
• \`/cuenta [slug]\` — Cambia cuenta activa
• \`/cuentas\` — Lista cuentas disponibles

*Publicación (PostSyncer):*
• \`/aprobar [ID]\` — Marca el post como listo para publicar
• \`/redes\` — Lista cuentas conectadas (LinkedIn, X) con sus IDs
• \`/publicar [ID] [linkedin|x|ambas] --idioma [en|es]\` — Publica ahora
• \`/publicar [ID] linkedin --idioma es --cuando "2026-04-28 10:00"\` — Agenda
• \`/publicar [ID] --cuenta 6495 --idioma es\` — A una cuenta específica
• \`/estado [ID]\` — Estado del post (local + PostSyncer)

*Otros:*
• \`/noticias\` — Noticias relevantes
• \`/ayuda\` — Este mensaje
• Sube una imagen y mencióname para guardarla como referente

También puedes escribir en lenguaje natural.`;

// --- Main processor ---

export interface SlackProcessResult {
  text: string;
  imageBuffer?: Buffer;
}

export async function processSlackMessage(
  text: string,
  channelId: string,
  files?: { url: string; name: string }[]
): Promise<SlackProcessResult> {
  try {
    const cleanText = text.replace(/<@[A-Z0-9]+>/g, "").trim();

    // Handle file uploads
    if (files && files.length > 0) {
      const file = files[0];
      const response = await fetch(file.url, {
        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString("base64");

      // If text contains a generation prompt → use image as one-time reference for generation
      const hasGenerationIntent = cleanText && (
        /^\/imagen\s/i.test(cleanText) ||
        /^\/contenido\s/i.test(cleanText) ||
        /genera|crea|haz|diseña|make|create|generate/i.test(cleanText)
      );

      if (hasGenerationIntent && cleanText) {
        // Use as one-time example for image generation
        const prompt = cleanText.replace(/^\/imagen\s+/i, "").replace(/^\/contenido\s+/i, "").trim();
        const accountId = await getActiveAccountId(channelId);
        if (!accountId) return { text: "No hay cuenta activa. Usa `/cuenta [slug]` primero." };

        const result = await generateContentImage({
          prompt,
          accountId,
          format: "1:1",
          useBrandStyle: true,
          referenceImageBase64: base64,
        });

        const supabase = getSupabase();
        const { data: item } = await supabase.from("content_items").insert({
          account_id: accountId, platform: "instagram", content_type: "image_only",
          image_storage_path: result.storagePath, image_public_url: result.publicUrl,
          image_format: "1:1", image_model: "nano-banana", image_prompt: result.enrichedPrompt,
          status: "draft", tags: [], generated_by: "slack",
        }).select().single();

        if (item) await supabase.from("image_generations").update({ content_item_id: item.id }).eq("id", result.generationId);

        const imgResponse = await fetch(result.publicUrl);
        const imageBuffer = Buffer.from(await imgResponse.arrayBuffer());

        return { text: `*Imagen generada usando tu referencia* (ID: \`${item?.id?.slice(0, 8) || "?"}\`)`, imageBuffer };
      }

      // Otherwise → save as permanent reference
      const msg = await handleUploadReference(buffer, file.name, channelId, cleanText || undefined);
      return { text: msg };
    }

    if (!cleanText) {
      return { text: "Hola! Soy Eywa, el bot de Aloud Content Lab.\n\n" + HELP_MESSAGE };
    }

    // Try slash commands first
    const command = parseCommand(cleanText);

    if (command) {
      if (command.intent === "general_chat" && /^\/ayuda/i.test(cleanText)) {
        return { text: HELP_MESSAGE };
      }

      switch (command.intent) {
        case "generate_from_url":
          if (!command.url) return { text: "Necesito una URL. Ejemplo: `/generar https://ejemplo.com`" };
          return { text: await handleGenerateFromUrl(command.url, command.member_name, command.focus) };

        case "generate_from_idea":
          if (!command.idea) return { text: "Necesito la idea. Ejemplo: `/idea AI en educación`" };
          return { text: await handleGenerateFromIdea(command.idea, command.member_name) };

        case "discover_news":
          return { text: await handleDiscoverNews() };

        case "refine_post":
          if (!command.post_id) return { text: "Necesito el ID. Ejemplo: `/refinar abc123 hazlo más directo`" };
          if (!command.instruction) return { text: "¿Qué cambios? Ejemplo: `/refinar abc123 tono más casual`" };
          return { text: await handleRefinePost(command.post_id, command.instruction) };

        case "list_posts":
          return { text: await handleListPosts(command.status_filter) };

        case "generate_image":
          if (!command.image_prompt) return { text: "Necesito una descripción. Ejemplo: `/imagen abstract gradient for tech post`" };
          return await handleGenerateImage(command.image_prompt, channelId, command.image_format, command.account_slug);

        case "generate_content":
          if (!command.idea) return { text: "Necesito una idea. Ejemplo: `/contenido AI en educación --plataforma instagram`" };
          return await handleGenerateContent(command.idea, channelId, command.platform, command.image_format);

        case "set_account":
          if (!command.account_slug) return { text: "Necesito el slug. Ejemplo: `/cuenta aloud`" };
          return { text: await setActiveAccount(channelId, command.account_slug) };

        case "list_accounts":
          return { text: await handleListAccounts() };

        case "list_images":
          return { text: await handleListImages(channelId) };

        case "delete_image":
          if (!command.content_item_id) return { text: "Necesito el ID. Ejemplo: `/borrar-imagen abc123`" };
          return { text: await handleDeleteImage(command.content_item_id) };

        case "approve_post":
          if (!command.post_id) return { text: "Necesito el ID. Ejemplo: `/aprobar abc123`" };
          return { text: await handleApprovePost(command.post_id) };

        case "list_social_accounts":
          return { text: await handleListSocialAccounts() };

        case "publish_post":
          if (!command.post_id) return { text: "Necesito el ID del post. Ejemplo: `/publicar abc123 linkedin --idioma es`" };
          return {
            text: await handlePublishPost(command.post_id, command.publish_target, command.publish_language, command.publish_when),
          };

        case "post_status":
          if (!command.post_id) return { text: "Necesito el ID. Ejemplo: `/estado abc123`" };
          return { text: await handlePostStatus(command.post_id) };
      }
    }

    // Natural language fallback
    const action = await interpretMessage(cleanText);

    switch (action.intent) {
      case "generate_from_url":
        if (!action.url) return { text: "Necesito una URL." };
        return { text: await handleGenerateFromUrl(action.url, action.member_name, action.focus) };
      case "generate_from_idea":
        if (!action.idea) return { text: "No entendí la idea." };
        return { text: await handleGenerateFromIdea(action.idea, action.member_name) };
      case "discover_news":
        return { text: await handleDiscoverNews() };
      case "refine_post":
        if (!action.post_id || !action.instruction) return { text: "Necesito ID e instrucción." };
        return { text: await handleRefinePost(action.post_id, action.instruction) };
      case "list_posts":
        return { text: await handleListPosts(action.status_filter) };
      case "generate_image":
        if (!action.image_prompt) return { text: "Necesito una descripción para la imagen." };
        return await handleGenerateImage(action.image_prompt, channelId, action.image_format, action.account_slug);
      case "generate_content":
        if (!action.idea) return { text: "Necesito una idea para el contenido." };
        return await handleGenerateContent(action.idea, channelId, action.platform, action.image_format);
      case "set_account":
        if (!action.account_slug) return { text: "¿A qué cuenta quieres cambiar?" };
        return { text: await setActiveAccount(channelId, action.account_slug) };
      case "list_accounts":
        return { text: await handleListAccounts() };
      case "list_images":
        return { text: await handleListImages(channelId) };
      case "delete_image":
        if (!action.content_item_id) return { text: "Necesito el ID de la imagen." };
        return { text: await handleDeleteImage(action.content_item_id) };
      case "approve_post":
        if (!action.post_id) return { text: "Necesito el ID del post a aprobar." };
        return { text: await handleApprovePost(action.post_id) };
      case "list_social_accounts":
        return { text: await handleListSocialAccounts() };
      case "publish_post":
        if (!action.post_id) return { text: "Necesito el ID del post para publicar." };
        return {
          text: await handlePublishPost(action.post_id, action.publish_target, action.publish_language, action.publish_when),
        };
      case "post_status":
        if (!action.post_id) return { text: "Necesito el ID del post." };
        return { text: await handlePostStatus(action.post_id) };
      case "general_chat":
      default:
        return { text: await handleGeneralChat(cleanText) };
    }
  } catch (error) {
    console.error("Slack bot error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { text: `Hubo un error procesando tu mensaje: ${message}` };
  }
}
