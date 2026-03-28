import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "./supabase";
import {
  buildSystemPrompt,
  buildGenerateFromUrlPrompt,
  buildGenerateFromIdeaPrompt,
} from "./prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface SlackAction {
  intent:
    | "generate_from_url"
    | "generate_from_idea"
    | "discover_news"
    | "refine_post"
    | "list_posts"
    | "general_chat";
  url?: string;
  idea?: string;
  member_name?: string;
  instruction?: string;
  post_id?: string;
  focus?: string;
  status_filter?: string;
}

const TEAM_MEMBERS = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

export async function interpretMessage(text: string): Promise<SlackAction> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: `You are a router for a Slack bot. Analyze the user message and determine the intent.

Available intents:
- "generate_from_url": User wants to generate a LinkedIn post from a URL. Extract the URL.
- "generate_from_idea": User wants to generate a LinkedIn post from an idea/topic.
- "discover_news": User wants to see latest relevant news/articles.
- "refine_post": User wants to edit/refine an existing post. Needs post_id and instruction.
- "list_posts": User wants to see existing posts. May filter by status (draft/ready/used).
- "general_chat": General question or conversation about content strategy.

Team members: ${TEAM_MEMBERS.join(", ")}

Return ONLY valid JSON:
{
  "intent": "...",
  "url": "extracted URL if any",
  "idea": "the idea/topic if generating from idea",
  "member_name": "team member name if mentioned",
  "instruction": "refinement instruction if refining",
  "post_id": "post ID if mentioned (usually a UUID)",
  "focus": "specific angle/focus if mentioned",
  "status_filter": "draft/ready/used if filtering posts"
}`,
    messages: [{ role: "user", content: text }],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "{}";
  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) {
    return { intent: "general_chat" };
  }

  try {
    return JSON.parse(match[0]) as SlackAction;
  } catch {
    return { intent: "general_chat" };
  }
}

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

export async function handleGenerateFromUrl(
  url: string,
  memberName?: string,
  focus?: string
): Promise<string> {
  const supabase = getSupabase();

  const { data: companyContext } = await supabase
    .from("company_context")
    .select("*");

  let memberProfile = null;
  if (memberName) {
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("name", memberName)
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

  const systemPrompt = buildSystemPrompt(
    companyContext || [],
    memberProfile,
    ratedExamples
  );
  const scrapedContent = await scrapeUrl(url);
  const userPrompt = buildGenerateFromUrlPrompt(url, scrapedContent, focus);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response");

  const generated = JSON.parse(jsonMatch[0]);

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      content_en: generated.content_en || null,
      content_es: generated.content_es || null,
      source_url: url,
      source_summary: generated.source_summary || null,
      status: "draft",
      tags: [],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  let result = `*Post generado desde URL* (ID: \`${post.id}\`)\n`;
  if (post.content_en) result += `\n*English:*\n${post.content_en}\n`;
  if (post.content_es) result += `\n*Español:*\n${post.content_es}\n`;
  if (post.source_summary) result += `\n_Fuente: ${post.source_summary}_`;
  return result;
}

export async function handleGenerateFromIdea(
  idea: string,
  memberName?: string
): Promise<string> {
  const supabase = getSupabase();

  const { data: companyContext } = await supabase
    .from("company_context")
    .select("*");

  let memberProfile = null;
  if (memberName) {
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("name", memberName)
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

  const systemPrompt = buildSystemPrompt(
    companyContext || [],
    memberProfile,
    ratedExamples
  );
  const userPrompt = buildGenerateFromIdeaPrompt(idea);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response");

  const generated = JSON.parse(jsonMatch[0]);

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      content_en: generated.content_en || null,
      content_es: generated.content_es || null,
      source_url: null,
      source_summary: null,
      status: "draft",
      tags: [],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  let result = `*Post generado desde idea* (ID: \`${post.id}\`)\n`;
  if (post.content_en) result += `\n*English:*\n${post.content_en}\n`;
  if (post.content_es) result += `\n*Español:*\n${post.content_es}\n`;
  return result;
}

export async function handleDiscoverNews(): Promise<string> {
  const supabase = getSupabase();

  const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("discover_cache")
    .select("*")
    .eq("source_type", "rss")
    .gte("cached_at", cutoff)
    .gte("relevance_score", 7)
    .order("relevance_score", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    return "No hay noticias en caché. Usa la app web para refrescar el feed, o espera a que se actualice automáticamente.";
  }

  let result = "*Noticias relevantes:*\n\n";
  for (const article of data) {
    result += `• *${article.title}* (${article.source}, score: ${article.relevance_score}/10)\n  ${article.link}\n\n`;
  }
  result +=
    "_Tip: Pega cualquier URL y te genero un post basado en la noticia._";
  return result;
}

export async function handleRefinePost(
  postId: string,
  instruction: string
): Promise<string> {
  const supabase = getSupabase();

  const { data: post, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .single();

  if (error || !post) return `No encontré el post con ID \`${postId}\`.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system:
      "You rewrite LinkedIn posts based on user instructions. Keep the same general topic but adjust based on the instruction. Do NOT mention or promote Aloud unless the user explicitly asks for it.",
    messages: [
      {
        role: "user",
        content: `Here are the current versions of a LinkedIn post:

ENGLISH:
${post.content_en || "N/A"}

SPANISH:
${post.content_es || "N/A"}

INSTRUCTION: ${instruction}

Rewrite both versions following the instruction. Format as JSON:
{"content_en": "...", "content_es": "..."}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response");

  const generated = JSON.parse(jsonMatch[0]);

  const { data: updated, error: updateError } = await supabase
    .from("posts")
    .update({
      content_en: generated.content_en || post.content_en,
      content_es: generated.content_es || post.content_es,
    })
    .eq("id", postId)
    .select()
    .single();

  if (updateError) throw new Error(updateError.message);

  let result = `*Post refinado* (ID: \`${updated.id}\`)\n`;
  if (updated.content_en) result += `\n*English:*\n${updated.content_en}\n`;
  if (updated.content_es) result += `\n*Español:*\n${updated.content_es}\n`;
  return result;
}

export async function handleListPosts(
  statusFilter?: string
): Promise<string> {
  const supabase = getSupabase();

  let query = supabase
    .from("posts")
    .select("id, content_en, content_es, status, used_by, rating, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0)
    return "No hay posts" + (statusFilter ? ` con estado "${statusFilter}"` : "") + ".";

  let result = `*Últimos posts${statusFilter ? ` (${statusFilter})` : ""}:*\n\n`;
  for (const post of data) {
    const preview = (
      (post.content_es || post.content_en || "") as string
    ).slice(0, 100);
    const rating = post.rating ? ` | ${post.rating}/5` : "";
    const assignee = post.used_by ? ` | ${post.used_by}` : "";
    result += `• \`${post.id.slice(0, 8)}\` [${post.status}${rating}${assignee}]\n  _${preview}..._\n\n`;
  }
  return result;
}

export async function handleGeneralChat(userMessage: string): Promise<string> {
  const supabase = getSupabase();
  const { data: companyContext } = await supabase
    .from("company_context")
    .select("*");

  const contextMap = Object.fromEntries(
    (companyContext || []).map((c) => [c.key, c.value])
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: `You are the Aloud Content Lab assistant on Slack. You help the team with content strategy for LinkedIn.

Company context:
- What we do: ${contextMap.company_description || "N/A"}
- Services: ${contextMap.services || "N/A"}
- Target audience: ${contextMap.target_audience || "N/A"}

You can help with:
- Brainstorming post ideas
- Content strategy advice
- Discussing trends in the creator economy
- Answering questions about posts

Respond in the same language the user writes in (Spanish or English). Be concise and conversational.

If the user seems to want to generate a post, remind them they can:
- Share a URL to generate a post from an article
- Describe an idea to generate a post from scratch
- Ask for latest news to find inspiration`,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content[0].type === "text"
    ? response.content[0].text
    : "No pude procesar tu mensaje.";
}

// Parse slash commands — returns an action if matched, null if not
function parseCommand(text: string): SlackAction | null {
  // /generar <URL>
  const generateMatch = text.match(/^\/generar\s+(https?:\/\/\S+)(?:\s+para\s+(\w+))?/i);
  if (generateMatch) {
    const memberName = generateMatch[2];
    return {
      intent: "generate_from_url",
      url: generateMatch[1],
      member_name: memberName && TEAM_MEMBERS.includes(memberName) ? memberName : undefined,
    };
  }

  // /idea <texto> [para <miembro>]
  const ideaMatch = text.match(/^\/idea\s+(.+?)(?:\s+para\s+(\w+)\s*$)?/i);
  if (ideaMatch) {
    const memberName = ideaMatch[2];
    return {
      intent: "generate_from_idea",
      idea: ideaMatch[1].trim(),
      member_name: memberName && TEAM_MEMBERS.includes(memberName) ? memberName : undefined,
    };
  }

  // /noticias
  if (/^\/noticias\s*$/i.test(text)) {
    return { intent: "discover_news" };
  }

  // /refinar <ID> <instrucción>
  const refineMatch = text.match(/^\/refinar\s+([a-f0-9-]+)\s+(.+)/i);
  if (refineMatch) {
    return {
      intent: "refine_post",
      post_id: refineMatch[1],
      instruction: refineMatch[2].trim(),
    };
  }

  // /posts [status]
  const postsMatch = text.match(/^\/posts(?:\s+(draft|ready|used))?\s*$/i);
  if (postsMatch) {
    return {
      intent: "list_posts",
      status_filter: postsMatch[1]?.toLowerCase(),
    };
  }

  // /ayuda
  if (/^\/ayuda\s*$/i.test(text)) {
    return { intent: "general_chat" };
  }

  return null;
}

const HELP_MESSAGE = `*Comandos disponibles:*

• \`/generar [URL]\` — Genera un post desde un artículo
• \`/generar [URL] para Daniel\` — Genera con el tono de un miembro
• \`/idea [texto]\` — Genera un post desde una idea
• \`/idea [texto] para Natalia\` — Idea con tono de un miembro
• \`/noticias\` — Muestra noticias relevantes
• \`/refinar [ID] [instrucción]\` — Refina un post existente
• \`/posts\` — Lista los últimos posts
• \`/posts draft\` — Filtra por estado (draft/ready/used)
• \`/ayuda\` — Muestra este mensaje

También puedes escribir en lenguaje natural y te entiendo igual.`;

export async function processSlackMessage(text: string): Promise<string> {
  try {
    // Remove bot mention from text
    const cleanText = text.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (!cleanText) {
      return "Hola! Soy el bot de Aloud Content Lab.\n\n" + HELP_MESSAGE;
    }

    // Try slash commands first (fast, no API call)
    const command = parseCommand(cleanText);

    if (command) {
      // /ayuda shortcut
      if (command.intent === "general_chat" && /^\/ayuda/i.test(cleanText)) {
        return HELP_MESSAGE;
      }

      switch (command.intent) {
        case "generate_from_url":
          if (!command.url) return "Necesito una URL. Ejemplo: `/generar https://ejemplo.com`";
          return await handleGenerateFromUrl(command.url, command.member_name, command.focus);

        case "generate_from_idea":
          if (!command.idea) return "Necesito la idea. Ejemplo: `/idea AI en educación`";
          return await handleGenerateFromIdea(command.idea, command.member_name);

        case "discover_news":
          return await handleDiscoverNews();

        case "refine_post":
          if (!command.post_id) return "Necesito el ID del post. Ejemplo: `/refinar abc123 hazlo más directo`";
          if (!command.instruction) return "¿Qué cambios quieres? Ejemplo: `/refinar abc123 tono más casual`";
          return await handleRefinePost(command.post_id, command.instruction);

        case "list_posts":
          return await handleListPosts(command.status_filter);
      }
    }

    // No command matched — use AI interpreter (natural language)
    const action = await interpretMessage(cleanText);

    switch (action.intent) {
      case "generate_from_url":
        if (!action.url) return "Necesito una URL para generar el post. Pégala en tu mensaje.";
        return await handleGenerateFromUrl(action.url, action.member_name, action.focus);

      case "generate_from_idea":
        if (!action.idea) return "No entendí la idea. Descríbela con más detalle.";
        return await handleGenerateFromIdea(action.idea, action.member_name);

      case "discover_news":
        return await handleDiscoverNews();

      case "refine_post":
        if (!action.post_id) return "Necesito el ID del post para refinarlo. Puedes ver los IDs con `/posts`.";
        if (!action.instruction) return "¿Qué cambios quieres hacer al post?";
        return await handleRefinePost(action.post_id, action.instruction);

      case "list_posts":
        return await handleListPosts(action.status_filter);

      case "general_chat":
      default:
        return await handleGeneralChat(cleanText);
    }
  } catch (error) {
    console.error("Slack bot error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return `Hubo un error procesando tu mensaje: ${message}`;
  }
}
