import * as chrono from "chrono-node";
import { getSupabase } from "./supabase";
import { buildSystemPrompt } from "./prompts";
import { buildPlatformCopyPrompt, buildPlatformFromUrlPrompt } from "./platforms";
import { getCachedArticles, fetchAndCacheNews } from "./discover";
import { generateText } from "./gemini";
import {
  createPost as postsyncerCreatePost,
  listAccounts as postsyncerListAccounts,
  getPost as postsyncerGetPost,
  getActiveWorkspaceId,
  type PostsyncerAccount,
} from "./postsyncer";
import type { Language, Platform } from "./types";

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Resolves a full UUID from either a complete UUID or a short prefix (8+ chars
// of hex). Returns null if nothing matches; throws if multiple matches.
async function resolveContentId(idOrPrefix: string): Promise<string | null> {
  const trimmed = idOrPrefix.trim();
  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase();
  if (trimmed.length < 4) return null;

  const supabase = getSupabase();
  const { data } = await supabase
    .from("content_items")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(200);
  const lower = trimmed.toLowerCase();
  const matches = (data || []).filter((d) => (d.id as string).toLowerCase().startsWith(lower));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Hay ${matches.length} posts que empiezan con \`${trimmed}\`. Usa más caracteres del ID.`);
  }
  return matches[0].id;
}

// Short ID for display in Slack messages — matches the prefix the user can type back.
function shortId(id: string): string {
  return id.slice(0, 8);
}

interface SlackAction {
  intent:
    | "generate_from_url"
    | "generate_from_idea"
    | "discover_news"
    | "refine_post"
    | "list_posts"
    | "general_chat"
    | "approve_post"
    | "list_social_accounts"
    | "publish_post"
    | "post_status"
    | "save_manual";
  url?: string;
  idea?: string;
  member_name?: string;
  instruction?: string;
  post_id?: string;
  focus?: string;
  status_filter?: string;
  publish_target?: string; // "linkedin" | "x" | "twitter" | "ambas" | comma-separated account ids
  publish_language?: Language;
  publish_when?: string; // raw user-provided datetime
  manual_text?: string;
  manual_language?: Language;
}

const TEAM_MEMBERS = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

// Slack-side handlers all write to the single Aloud account in `accounts`.
async function getDefaultAccountId(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("accounts")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  if (data?.id) return data.id;
  // Fallback: any account at all.
  const { data: any } = await supabase.from("accounts").select("id").limit(1).maybeSingle();
  if (!any?.id) throw new Error("No account configured. Create one in Settings first.");
  return any.id;
}

async function buildCopySystemPrompt(memberName?: string): Promise<string> {
  const supabase = getSupabase();
  const { data: companyContext } = await supabase.from("company_context").select("*");
  let memberProfile = null;
  if (memberName) {
    const { data } = await supabase.from("team_members").select("*").eq("name", memberName).single();
    memberProfile = data;
  }
  const { data: ratedItems } = await supabase
    .from("content_items")
    .select("copy_text, rating")
    .gte("rating", 4)
    .not("rating", "is", null);
  const ratedExamples = (ratedItems || [])
    .map((p) => ({ content: ((p.copy_text || "") as string).slice(0, 1500), rating: p.rating as number }))
    .filter((e) => e.content.length > 0);
  return buildSystemPrompt(companyContext || [], memberProfile, ratedExamples);
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
- "approve_post": Approve a post for publishing. Needs post_id.
- "list_social_accounts": List connected social accounts in PostSyncer (LinkedIn, X, etc).
- "publish_post": Publish/schedule a post via PostSyncer. Needs post_id, publish_target (linkedin/x/ambas or numeric ids), publish_language (en/es), optional publish_when.
- "post_status": Check publishing status of a post. Needs post_id.
- "save_manual": Save a piece of copy verbatim (no AI rewrite). Use when the user says "guarda este texto literal", "save as-is", "no lo cambies", "save this exact post", etc. Needs manual_text and manual_language.
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
  "publish_target": "linkedin/x/ambas/account-id if publishing",
  "publish_language": "en/es if publishing",
  "publish_when": "natural date/time string if scheduling",
  "manual_text": "the exact text to save verbatim if save_manual",
  "manual_language": "en/es of the manual text"
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

// Slack defaults: LinkedIn platform, Spanish copy. Override with options later if needed.
const SLACK_DEFAULT_PLATFORM: Platform = "linkedin";
const SLACK_DEFAULT_LANGUAGE: Language = "es";

export async function handleGenerateFromUrl(url: string, memberName?: string, focus?: string): Promise<string> {
  const supabase = getSupabase();
  const accountId = await getDefaultAccountId();
  const systemPrompt = await buildCopySystemPrompt(memberName);
  const scrapedContent = await scrapeUrl(url);
  const userPrompt = buildPlatformFromUrlPrompt(
    SLACK_DEFAULT_PLATFORM,
    url,
    scrapedContent,
    SLACK_DEFAULT_LANGUAGE,
    focus
  );
  const copyText = await generateText(systemPrompt, userPrompt);

  const { data: item, error } = await supabase
    .from("content_items")
    .insert({
      account_id: accountId,
      platform: SLACK_DEFAULT_PLATFORM,
      copy_text: copyText.trim(),
      copy_language: SLACK_DEFAULT_LANGUAGE,
      source_url: url,
      status: "draft",
      tags: [],
      generated_by: "slack",
      source_type: "ai_generated",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return `*Post generado desde URL* (ID: \`${shortId(item.id)}\`)\n\n${item.copy_text}`;
}

export async function handleGenerateFromIdea(idea: string, memberName?: string): Promise<string> {
  const supabase = getSupabase();
  const accountId = await getDefaultAccountId();
  const systemPrompt = await buildCopySystemPrompt(memberName);
  const userPrompt = buildPlatformCopyPrompt(SLACK_DEFAULT_PLATFORM, idea, SLACK_DEFAULT_LANGUAGE);
  const copyText = await generateText(systemPrompt, userPrompt);

  const { data: item, error } = await supabase
    .from("content_items")
    .insert({
      account_id: accountId,
      platform: SLACK_DEFAULT_PLATFORM,
      copy_text: copyText.trim(),
      copy_language: SLACK_DEFAULT_LANGUAGE,
      status: "draft",
      tags: [],
      generated_by: "slack",
      source_type: "ai_generated",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return `*Post generado desde idea* (ID: \`${shortId(item.id)}\`)\n\n${item.copy_text}`;
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
  const id = await resolveContentId(postId);
  if (!id) return `No encontré el post con ID \`${postId}\`.`;

  const supabase = getSupabase();
  const { data: item, error } = await supabase.from("content_items").select("*").eq("id", id).single();
  if (error || !item) return `No encontré el post con ID \`${postId}\`.`;

  const langName = item.copy_language === "en" ? "English" : "Spanish";
  const rewritten = await generateText(
    `You rewrite social media posts based on user instructions. Keep the same general topic but adjust based on the instruction. Do NOT mention or promote Aloud unless the user explicitly asks for it. Respond ONLY with the rewritten post text — no JSON, no labels, no quotes.`,
    `Current post (${langName}, platform: ${item.platform}):\n\n${item.copy_text || ""}\n\nINSTRUCTION: ${instruction}\n\nRewrite the post in ${langName} following the instruction.`
  );
  const newCopy = rewritten.trim() || item.copy_text;

  const { data: updated, error: updateError } = await supabase
    .from("content_items")
    .update({ copy_text: newCopy })
    .eq("id", id)
    .select()
    .single();
  if (updateError) throw new Error(updateError.message);

  return `*Post refinado* (ID: \`${shortId(updated.id)}\`)\n\n${updated.copy_text}`;
}

export async function handleListPosts(statusFilter?: string): Promise<string> {
  const supabase = getSupabase();
  let query = supabase
    .from("content_items")
    .select("id, copy_text, copy_language, platform, status, used_by, rating, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return "No hay posts" + (statusFilter ? ` con estado "${statusFilter}"` : "") + ".";
  let result = `*Últimos posts${statusFilter ? ` (${statusFilter})` : ""}:*\n\n`;
  for (const item of data) {
    const preview = ((item.copy_text || "") as string).slice(0, 100);
    const rating = item.rating ? ` | ${item.rating}/5` : "";
    const assignee = item.used_by ? ` | ${item.used_by}` : "";
    const lang = item.copy_language ? ` | ${item.copy_language}` : "";
    result += `• \`${item.id.slice(0, 8)}\` [${item.platform}${lang} | ${item.status}${rating}${assignee}]\n  _${preview}..._\n\n`;
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

export async function handleSaveManual(text: string, language: Language): Promise<string> {
  const supabase = getSupabase();
  const accountId = await getDefaultAccountId();
  const { data: item, error } = await supabase
    .from("content_items")
    .insert({
      account_id: accountId,
      platform: SLACK_DEFAULT_PLATFORM,
      copy_text: text,
      copy_language: language,
      source_type: "manual",
      status: "draft",
      tags: [],
      generated_by: "slack",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return `*Copy guardado tal cual* (ID: \`${shortId(item.id)}\`) — idioma: ${language}\nUsa \`/aprobar ${shortId(item.id)}\` y luego \`/publicar ${shortId(item.id)} [linkedin|x|ambas]\` para programarlo.`;
}

// --- PostSyncer handlers ---

// Parses a natural-language datetime ("mañana 8am", "tomorrow 9am", "lunes 10am",
// "in 2 days", "2026-05-08 08:00", ISO strings...). Defaults to Bogota (UTC-5)
// when the user does not specify a timezone.
function parseScheduleTime(input: string): string {
  const text = input.trim().replace(/^"|"$/g, "");

  // Try Spanish first, then English/casual. forwardDate=true means weekday names
  // and bare dates always resolve to the upcoming occurrence, not a past one.
  const ref = new Date();
  const opts = { forwardDate: true };
  const results = [
    ...chrono.es.parse(text, ref, opts),
    ...chrono.casual.parse(text, ref, opts),
  ];
  if (results.length === 0) {
    throw new Error(`Fecha inválida: "${input}". Prueba "mañana 8am" o "2026-05-08 08:00".`);
  }

  const start = results[0].start;

  // If the parsed string already pinned a timezone, trust it. Otherwise interpret
  // the local components in Bogota time (UTC-5, no DST) and emit an ISO string.
  if (start.isCertain("timezoneOffset")) {
    return start.date().toISOString();
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = start.get("year") ?? new Date().getFullYear();
  const month = start.get("month") ?? 1;
  const day = start.get("day") ?? 1;
  const hour = start.get("hour") ?? 9;
  const minute = start.get("minute") ?? 0;
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-05:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new Error(`Fecha inválida: "${input}".`);
  }
  return d.toISOString();
}

// Platform aliases the user can type. Maps to PostsyncerPlatform values.
const PLATFORM_ALIASES: Record<string, string[]> = {
  linkedin: ["linkedin"],
  in: ["linkedin"],
  x: ["twitter"],
  twitter: ["twitter"],
  instagram: ["instagram"],
  ig: ["instagram"],
  insta: ["instagram"],
  facebook: ["facebook"],
  fb: ["facebook"],
  tiktok: ["tiktok"],
  threads: ["threads"],
  ambas: ["linkedin", "twitter"],
  ambos: ["linkedin", "twitter"],
  todas: ["linkedin", "twitter", "instagram", "facebook", "tiktok", "threads"],
  all: ["linkedin", "twitter", "instagram", "facebook", "tiktok", "threads"],
};

function describeAccount(a: PostsyncerAccount): string {
  const handle = a.username ? ` @${a.username}` : "";
  return `\`${a.name}${handle}\` (${a.platform}, id ${a.id})`;
}

// Looks for accounts where name OR username equals/contains the hint (case-insensitive).
// Exact matches always win over substring matches so "aloud" picks the LinkedIn account
// named exactly "Aloud" instead of also colliding with the Instagram "Aloud Lab".
function matchByHint(
  accounts: PostsyncerAccount[],
  hint: string
): PostsyncerAccount[] {
  const lower = hint.toLowerCase();
  const exact = accounts.filter(
    (a) =>
      !a.has_expired &&
      (a.name.toLowerCase() === lower || (a.username || "").toLowerCase() === lower)
  );
  if (exact.length > 0) return exact;
  return accounts.filter(
    (a) =>
      !a.has_expired &&
      (a.name.toLowerCase().includes(lower) || (a.username || "").toLowerCase().includes(lower))
  );
}

// Resolves the target string into one or more PostSyncer account IDs. Accepts:
//   • platform aliases: linkedin / in / x / twitter / instagram / ig / facebook / fb /
//                       tiktok / threads / ambas / todas
//   • PostSyncer numeric account ID (single or comma-separated)
//   • account name or username substring (e.g. "Daniel Velilla", "aloudlab.es")
//   • platform:hint syntax to scope the substring search to one platform
//                       (e.g. "linkedin:daniel", "instagram:.es")
function resolveTargetAccountIds(
  target: string,
  accounts: PostsyncerAccount[]
): { ids: number[]; resolved: PostsyncerAccount[]; error?: string } {
  const trimmed = target.trim();
  const lower = trimmed.toLowerCase();

  // Numeric / comma-separated PostSyncer account IDs.
  if (/^[\d,\s]+$/.test(trimmed)) {
    const ids = trimmed.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    const resolved = accounts.filter((a) => ids.includes(a.id));
    if (resolved.length !== ids.length) {
      const missing = ids.filter((id) => !resolved.find((a) => a.id === id));
      return { ids: [], resolved: [], error: `IDs no encontrados: ${missing.join(", ")}` };
    }
    return { ids, resolved };
  }

  // platform:hint syntax — scope the substring match to a specific platform.
  if (lower.includes(":")) {
    const [platformAlias, ...rest] = lower.split(":");
    const hint = rest.join(":").trim();
    const platforms = PLATFORM_ALIASES[platformAlias.trim()];
    if (!platforms) {
      return {
        ids: [],
        resolved: [],
        error: `No reconocí la plataforma "${platformAlias}". Usa linkedin, x, instagram, facebook, tiktok, threads, ambas, todas.`,
      };
    }
    if (!hint) {
      return { ids: [], resolved: [], error: `Falta el nombre/handle después de "${platformAlias}:".` };
    }
    const platformAccounts = accounts.filter((a) => platforms.includes(a.platform));
    const matches = matchByHint(platformAccounts, hint);
    if (matches.length === 0) {
      return { ids: [], resolved: [], error: `No hay cuentas en ${platforms.join("/")} que coincidan con "${hint}".` };
    }
    if (matches.length > 1) {
      return {
        ids: [],
        resolved: [],
        error: `Varias cuentas coinciden con "${target}": ${matches.map(describeAccount).join(", ")}. Sé más específico.`,
      };
    }
    return { ids: [matches[0].id], resolved: matches };
  }

  // Plain platform alias.
  const platforms = PLATFORM_ALIASES[lower];
  if (platforms) {
    const matched = accounts.filter((a) => platforms.includes(a.platform) && !a.has_expired);
    if (matched.length === 0) {
      return { ids: [], resolved: [], error: `No hay cuentas activas para: ${platforms.join(", ")}.` };
    }

    // Multi-platform aliases (ambas / todas) pick one of each platform.
    if (platforms.length > 1) {
      const ids: number[] = [];
      const resolved: PostsyncerAccount[] = [];
      const ambiguous: string[] = [];
      for (const platform of platforms) {
        const ofPlatform = matched.filter((a) => a.platform === platform);
        if (ofPlatform.length === 0) continue;
        if (ofPlatform.length === 1) {
          ids.push(ofPlatform[0].id);
          resolved.push(ofPlatform[0]);
          continue;
        }
        ambiguous.push(`${platform}: ${ofPlatform.map(describeAccount).join(", ")}`);
      }
      if (ambiguous.length > 0) {
        return {
          ids: [],
          resolved: [],
          error: `Hay varias cuentas en estas plataformas. Especifica con \`platform:hint\` o id:\n${ambiguous.join("\n")}`,
        };
      }
      if (ids.length === 0) {
        return { ids: [], resolved: [], error: `No hay cuentas activas para ${platforms.join("/")}.` };
      }
      return { ids, resolved };
    }

    // Single-platform alias (linkedin, x, instagram, etc.). If multiple accounts on
    // that platform, force the user to disambiguate — never silently pick a default,
    // because that's how a "linkedin" command can accidentally publish to X via the
    // workspace default.
    const platform = platforms[0];
    const ofPlatform = matched.filter((a) => a.platform === platform);
    if (ofPlatform.length === 1) {
      return { ids: [ofPlatform[0].id], resolved: ofPlatform };
    }
    return {
      ids: [],
      resolved: [],
      error: `Hay varias cuentas de ${platform}. Especifica cuál: ${ofPlatform.map(describeAccount).join(", ")}. Puedes usar \`${lower}:hint\` o el id directo.`,
    };
  }

  // Fall through: free-form name/username substring match across all accounts.
  const matches = matchByHint(accounts, lower);
  if (matches.length === 1) {
    return { ids: [matches[0].id], resolved: matches };
  }
  if (matches.length > 1) {
    return {
      ids: [],
      resolved: [],
      error: `Varias cuentas coinciden con "${target}": ${matches.map(describeAccount).join(", ")}. Sé más específico o usa \`platform:hint\`.`,
    };
  }

  return {
    ids: [],
    resolved: [],
    error: `No reconocí "${target}". Usa \`linkedin\`, \`x\`, \`instagram\`, \`ambas\`, un nombre de cuenta, o un id (ver \`/redes\`).`,
  };
}

interface PublishableRecord {
  id: string;
  status: string;
  text_en: string | null;
  text_es: string | null;
  default_language: Language | null;
  approved_at: string | null;
  postsyncer_post_id: string | null;
  published_to: string[] | null;
  scheduled_at: string | null;
  publish_language: Language | null;
}

async function findPublishable(id: string): Promise<PublishableRecord | null> {
  const supabase = getSupabase();
  const { data: item } = await supabase
    .from("content_items")
    .select("id, status, copy_text, copy_language, approved_at, postsyncer_post_id, published_to, scheduled_at, publish_language")
    .eq("id", id)
    .maybeSingle();
  if (!item) return null;

  return {
    id: item.id,
    status: item.status,
    text_en: item.copy_language === "en" ? item.copy_text : null,
    text_es: item.copy_language === "es" ? item.copy_text : null,
    default_language: item.copy_language as Language | null,
    approved_at: item.approved_at,
    postsyncer_post_id: item.postsyncer_post_id,
    published_to: item.published_to,
    scheduled_at: item.scheduled_at,
    publish_language: item.publish_language,
  };
}

export async function handleApprovePost(postId: string): Promise<string> {
  const id = await resolveContentId(postId);
  if (!id) return `No encontré el post con ID \`${postId}\`.`;
  const record = await findPublishable(id);
  if (!record) return `No encontré el post con ID \`${postId}\`.`;
  if (record.status === "used") return `El post \`${shortId(id)}\` ya fue publicado.`;
  if (record.status === "ready") return `El post \`${shortId(id)}\` ya estaba aprobado.`;

  const supabase = getSupabase();
  const { error: updateError } = await supabase
    .from("content_items")
    .update({ status: "ready", approved_at: new Date().toISOString(), approved_by: "slack" })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  const idiomaHint = record.default_language ? "" : " --idioma [en|es]";
  return `*Post aprobado* \`${shortId(id)}\` ✅\nUsa \`/publicar ${shortId(id)} [linkedin|x|ambas]${idiomaHint}\` para publicar.`;
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
  if (!target) return "Necesito el destino. Ejemplo: `/publicar abc12345 linkedin --idioma es`";

  const id = await resolveContentId(postId);
  if (!id) return `No encontré el post con ID \`${postId}\`.`;

  const record = await findPublishable(id);
  if (!record) return `No encontré el post con ID \`${postId}\`.`;
  if (record.status !== "ready") {
    return `El post \`${shortId(id)}\` está en estado \`${record.status}\`. Apruébalo primero con \`/aprobar ${shortId(id)}\`.`;
  }

  const resolvedLanguage: Language | undefined = language || record.default_language || undefined;
  if (!resolvedLanguage) return "¿En qué idioma? Agrega `--idioma en` o `--idioma es`.";

  const text = resolvedLanguage === "en" ? record.text_en : record.text_es;
  if (!text) {
    const langLabel = resolvedLanguage === "en" ? "inglés" : "español";
    return `El post \`${shortId(id)}\` no tiene contenido en ${langLabel}.`;
  }

  const accounts = await postsyncerListAccounts();
  const { ids, resolved, error: targetError } = resolveTargetAccountIds(target, accounts);
  if (targetError) return targetError;
  if (ids.length === 0) {
    return `No pude resolver "${target}" a una cuenta de PostSyncer. Usa \`/redes\` para ver opciones.`;
  }

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
  const supabase = getSupabase();
  await supabase
    .from("content_items")
    .update({
      status: "used",
      postsyncer_post_id: String(created.id ?? ""),
      postsyncer_account_ids: ids,
      published_to: platforms,
      scheduled_at: scheduledAt || null,
      publish_language: resolvedLanguage,
    })
    .eq("id", id);

  const accountList = resolved.map((a) => `${a.platform}/${a.name}`).join(", ");
  const when_msg = scheduledAt ? `agendado para ${scheduledAt}` : "publicado ahora";
  return `*Post enviado a PostSyncer* (ID PostSyncer: \`${created.id}\`)\n• Cuentas: ${accountList}\n• ${when_msg}\n• Idioma: ${resolvedLanguage}`;
}

export async function handlePostStatus(postId: string): Promise<string> {
  const id = await resolveContentId(postId);
  if (!id) return `No encontré el post con ID \`${postId}\`.`;
  const record = await findPublishable(id);
  if (!record) return `No encontré el post con ID \`${postId}\`.`;

  let result = `*Post \`${shortId(id)}\`*\n• Estado local: ${record.status}\n`;
  if (record.approved_at) result += `• Aprobado: ${record.approved_at}\n`;
  if (record.published_to?.length) result += `• Plataformas: ${record.published_to.join(", ")}\n`;
  if (record.publish_language) result += `• Idioma: ${record.publish_language}\n`;
  if (record.scheduled_at) result += `• Agendado: ${record.scheduled_at}\n`;

  if (record.postsyncer_post_id) {
    try {
      const remote = await postsyncerGetPost(record.postsyncer_post_id);
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

  // Accept short prefixes (4+ hex chars) so users don't need to paste the full UUID.
  const refineMatch = text.match(/^\/refinar\s+([a-f0-9-]{4,})\s+(.+)/i);
  if (refineMatch) return { intent: "refine_post", post_id: refineMatch[1], instruction: refineMatch[2].trim() };

  const postsMatch = text.match(/^\/posts(?:\s+(draft|ready|used))?\s*$/i);
  if (postsMatch) return { intent: "list_posts", status_filter: postsMatch[1]?.toLowerCase() };

  if (/^\/ayuda\s*$/i.test(text)) return { intent: "general_chat" };

  // /copia [es|en] <texto>  — defaults to es when language is omitted.
  const copiaMatch = text.match(/^\/copia\s+(?:(en|es)\s+)?([\s\S]+)/i);
  if (copiaMatch) {
    return {
      intent: "save_manual",
      manual_text: copiaMatch[2].trim(),
      manual_language: ((copiaMatch[1]?.toLowerCase() as Language) || "es"),
    };
  }

  // PostSyncer commands
  const aprobarMatch = text.match(/^\/aprobar\s+([a-f0-9-]{4,})\s*$/i);
  if (aprobarMatch) return { intent: "approve_post", post_id: aprobarMatch[1] };

  if (/^\/redes\s*$/i.test(text)) return { intent: "list_social_accounts" };

  const estadoMatch = text.match(/^\/estado\s+([a-f0-9-]{4,})\s*$/i);
  if (estadoMatch) return { intent: "post_status", post_id: estadoMatch[1] };

  const publicarMatch = text.match(/^\/publicar\s+(.+)/i);
  if (publicarMatch) {
    const args = publicarMatch[1];
    // Flags accept any of: --flag value, --flag=value, --flag"value", --flag "value".
    // Unquoted values can be multi-word; the value ends at the next " --" or end-of-string.
    const cuandoMatch = args.match(/--cuando[\s=]*(?:"([^"]*)"|(?!--)(.+?))(?=\s+--|\s*$)/i);
    const idiomaMatch = args.match(/--idioma[\s=]*(en|es)/i);
    const cleaned = args
      .replace(/--cuando[\s=]*(?:"[^"]*"|(?!--).+?)(?=\s+--|\s*$)/gi, "")
      .replace(/--idioma[\s=]*(?:en|es)/gi, "")
      // Legacy flag that no longer exists; strip so it doesn't pollute the target arg.
      .replace(/--cuenta[\s=]*[\d,\s]+/gi, "")
      .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    return {
      intent: "publish_post",
      post_id: parts[0],
      publish_target: parts.slice(1).join(" ") || undefined,
      publish_language: (idiomaMatch?.[1].toLowerCase() as Language) || undefined,
      publish_when: (cuandoMatch?.[1] ?? cuandoMatch?.[2])?.trim(),
    };
  }

  return null;
}

// --- Help message ---

const HELP_MESSAGE = `*Comandos disponibles:*

_IDs cortos: bastan los primeros 8 caracteres (ej. \`a3f29c41\`)._

*Generación (LinkedIn, español):*
• \`/generar [URL]\` — Post desde un artículo
• \`/generar [URL] para Daniel\` — Con tono de un miembro
• \`/idea [texto]\` — Post desde una idea
• \`/refinar [ID] [instrucción]\` — Refina un post
• \`/posts\` — Lista los últimos 5 (filtrar: \`/posts draft\`)

*Texto literal (sin IA):*
• \`/copia [texto]\` — Guarda el copy tal cual (default español)
• \`/copia en [texto]\` — Guarda en inglés

*Publicación (PostSyncer):*
• \`/aprobar [ID]\` — Marca el post como listo para publicar
• \`/redes\` — Lista cuentas conectadas con sus IDs y handles
• \`/publicar [ID] [destino]\` — Publica ya
• \`/publicar [ID] [destino] --cuando "mañana 8am"\` — Agenda
• \`/estado [ID]\` — Estado del post (local + PostSyncer)

*Destinos válidos* (cuando hay 1 cuenta por plataforma):
\`linkedin\`, \`x\`, \`instagram\`, \`ig\`, \`facebook\`, \`fb\`, \`tiktok\`, \`threads\`, \`ambas\`, \`todas\`

*Cuando hay varias cuentas en una plataforma* (caso Aloud), especifica con:
• \`platform:hint\` — \`linkedin:daniel\`, \`linkedin:aloud\`, \`instagram:.es\`
• Nombre o handle único — \`velilla\`, \`aloudlab.es\`, \`danielvelillap\`
• ID numérico — \`6494\`, \`6495\`

*Fechas que entiende* (Spanish + English):
\`mañana 8am\`, \`tomorrow at 9am\`, \`lunes 10am\`, \`in 2 days\`, \`2026-05-10 08:00\`

*Otros:*
• \`/noticias\` — Noticias relevantes
• \`/ayuda\` — Este mensaje

También puedes escribir en lenguaje natural.`;

// --- Main processor ---

export interface SlackProcessResult {
  text: string;
}

export async function processSlackMessage(
  text: string,
  channelId: string
): Promise<SlackProcessResult> {
  try {
    const cleanText = text.replace(/<@[A-Z0-9]+>/g, "").trim();

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

        case "save_manual":
          if (!command.manual_text) return { text: "Necesito el texto. Ejemplo: `/copia Mi post tal cual quiero que se publique`" };
          return { text: await handleSaveManual(command.manual_text, command.manual_language || "es") };
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
      case "save_manual":
        if (!action.manual_text) return { text: "Necesito el texto a guardar literal." };
        return { text: await handleSaveManual(action.manual_text, action.manual_language || "es") };
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
