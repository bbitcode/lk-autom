import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";
import {
  buildSystemPrompt,
  buildGenerateFromUrlPrompt,
  buildGenerateFromIdeaPrompt,
} from "@/lib/prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function scrapeUrl(url: string): Promise<string> {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to scrape URL");
  }

  const markdown = data.data?.markdown || "";
  return markdown.slice(0, 8000);
}

export async function POST(req: NextRequest) {
  try {
    const { type, url, idea, member_name, model, focus } = await req.json();
    const supabase = getSupabase();

    const { data: companyContext } = await supabase
      .from("company_context")
      .select("*");

    let memberProfile = null;
    if (member_name) {
      const { data } = await supabase
        .from("team_members")
        .select("*")
        .eq("name", member_name)
        .single();
      memberProfile = data;
    }

    // Fetch highly-rated posts (4-5 stars) as style examples
    const { data: ratedPosts } = await supabase
      .from("posts")
      .select("content_en, content_es, rating")
      .gte("rating", 4)
      .not("rating", "is", null);

    const ratedExamples = (ratedPosts || [])
      .map((p) => ({
        content: (p.content_en || p.content_es || "").slice(0, 1500),
        rating: p.rating as number,
      }))
      .filter((e) => e.content.length > 0);

    const systemPrompt = buildSystemPrompt(companyContext || [], memberProfile, ratedExamples);

    let userPrompt: string;
    let sourceUrl: string | null = null;

    if (type === "url" && url) {
      const scrapedContent = await scrapeUrl(url);
      userPrompt = buildGenerateFromUrlPrompt(url, scrapedContent, focus);
      sourceUrl = url;
    } else if (type === "idea" && idea) {
      userPrompt = buildGenerateFromIdeaPrompt(idea);
    } else {
      return NextResponse.json(
        { error: "Must provide url or idea" },
        { status: 400 }
      );
    }

    const message = await anthropic.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const generated = JSON.parse(jsonMatch[0]);

    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        content_en: generated.content_en || null,
        content_es: generated.content_es || null,
        source_url: sourceUrl,
        source_summary: generated.source_summary || null,
        status: "draft",
        tags: [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(post);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Generate error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
