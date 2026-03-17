import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SITES_TO_SCRAPE = [
  { name: "Creator Spotlight", url: "https://www.creatorspotlight.com/" },
  { name: "The Publish Press", url: "https://news.thepublishpress.com/" },
  { name: "Digiday", url: "https://digiday.com/" },
];

interface ExtractedArticle {
  title: string;
  link: string;
  source: string;
}

async function scrapeWithFirecrawl(url: string): Promise<string> {
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
    throw new Error(`Firecrawl error for ${url}: ${data.error}`);
  }

  return (data.data?.markdown || "").slice(0, 10000);
}

async function extractArticles(
  markdown: string,
  sourceName: string,
  sourceUrl: string
): Promise<ExtractedArticle[]> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `Extract article titles and URLs from this webpage content. Return ONLY a JSON array of objects with "title" and "link" fields. If a link is relative, prepend the base URL. Only include actual articles, not navigation links or ads. Max 15 articles.`,
    messages: [
      {
        role: "user",
        content: `Base URL: ${sourceUrl}\n\nContent:\n${markdown}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const articles: { title: string; link: string }[] = JSON.parse(match[0]);
    return articles.map((a) => ({
      title: a.title,
      link: a.link,
      source: sourceName,
    }));
  } catch {
    return [];
  }
}

async function scoreArticles(
  articles: ExtractedArticle[]
): Promise<(ExtractedArticle & { relevance_score: number })[]> {
  if (articles.length === 0) return [];

  const titlesBlock = articles
    .map((a, i) => `${i}. ${a.title} [${a.source}]`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: `You score news articles for relevance to Aloud, a product studio that builds digital products for content creators (courses, newsletters, communities, apps, monetization tools).

Score each article 1-10:
- 8-10: Directly about creator economy, creator monetization, newsletter/podcast/community platforms, digital product launches for creators
- 5-7: Related to content creation, social media platforms, media business models, audience building
- 1-4: Unrelated (general tech, politics, sports, local news, entertainment gossip)

Return ONLY a JSON array of scores in order, like [8, 3, 7, ...]`,
    messages: [
      {
        role: "user",
        content: `Score these articles:\n${titlesBlock}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return articles.map((a) => ({ ...a, relevance_score: 5 }));

  try {
    const scores: number[] = JSON.parse(match[0]);
    return articles.map((a, i) => ({
      ...a,
      relevance_score: scores[i] ?? 5,
    }));
  } catch {
    return articles.map((a) => ({ ...a, relevance_score: 5 }));
  }
}

export async function POST() {
  return runScrape();
}

async function runScrape() {
  try {
    const supabase = getSupabase();

    // Scrape all sites in parallel
    const scrapeResults = await Promise.allSettled(
      SITES_TO_SCRAPE.map(async (site) => {
        const markdown = await scrapeWithFirecrawl(site.url);
        return extractArticles(markdown, site.name, site.url);
      })
    );

    // Flatten all extracted articles
    const allArticles: ExtractedArticle[] = [];
    const seenLinks = new Set<string>();

    for (const result of scrapeResults) {
      if (result.status === "fulfilled") {
        for (const article of result.value) {
          if (article.link && !seenLinks.has(article.link)) {
            seenLinks.add(article.link);
            allArticles.push(article);
          }
        }
      }
    }

    // Score with AI
    const scored = await scoreArticles(allArticles);

    // Upsert into cache
    const rows = scored.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source,
      date: new Date().toISOString(),
      snippet: "",
      relevance_score: a.relevance_score,
      source_type: "scrape",
      cached_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await supabase
        .from("discover_cache")
        .upsert(rows, { onConflict: "link" });
    }

    const relevant = scored.filter((a) => a.relevance_score >= 7);

    return NextResponse.json({
      total_scraped: allArticles.length,
      relevant: relevant.length,
      articles: relevant,
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scrape failed" },
      { status: 500 }
    );
  }
}
