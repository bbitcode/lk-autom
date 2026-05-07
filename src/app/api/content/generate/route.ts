import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateText } from "@/lib/gemini";
import {
  buildPlatformCopyPrompt,
  buildPlatformFromUrlPrompt,
} from "@/lib/platforms";
import { buildSystemPrompt } from "@/lib/prompts";
import type { Platform, Language } from "@/lib/types";

export const maxDuration = 60;

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      account_id,
      platform,
      copy_input,
      copy_language = "es",
      member_name,
      source_type = "ai_generated",
      url,
      focus,
    } = body as {
      account_id: string;
      platform: Platform;
      copy_input?: string;
      copy_language?: Language;
      member_name?: string;
      source_type?: "ai_generated" | "manual";
      url?: string;
      focus?: string;
    };

    if (!account_id || !platform) {
      return NextResponse.json(
        { error: "account_id and platform are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const isUrlMode = !!url;
    if (!isUrlMode && !copy_input) {
      return NextResponse.json({ error: "copy_input or url is required" }, { status: 400 });
    }
    if (isUrlMode && source_type === "manual") {
      return NextResponse.json({ error: "Manual mode is not compatible with URL input" }, { status: 400 });
    }

    let copyText: string;
    if (source_type === "manual") {
      copyText = copy_input!;
    } else {
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

      const userPrompt = isUrlMode
        ? buildPlatformFromUrlPrompt(platform, url!, await scrapeUrl(url!), copy_language, focus)
        : buildPlatformCopyPrompt(platform, copy_input!, copy_language);

      copyText = await generateText(systemPrompt, userPrompt);
    }

    const { data: contentItem, error } = await supabase
      .from("content_items")
      .insert({
        account_id,
        platform,
        copy_text: copyText,
        copy_language,
        status: "draft",
        tags: [],
        generated_by: "web",
        source_type,
        source_url: url || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(contentItem);
  } catch (error) {
    console.error("Content generate error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
