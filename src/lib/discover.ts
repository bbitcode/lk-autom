import Parser from "rss-parser";
import { getSupabase } from "./supabase";
import { generateText } from "./gemini";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; AloudBot/1.0)",
  },
});

const KEYWORDS = [
  '"creator economy" monetization',
  '"content creator" business revenue',
  'newsletter platform growth subscribers',
  'podcast monetization creators',
  'digital products creators audience',
  '"creator tools" startup',
  'influencer economy brand deals',
  'community membership platform creator',
];

function buildGoogleNewsUrl(keyword: string): string {
  const q = encodeURIComponent(keyword);
  return `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`;
}

const STATIC_FEEDS = [
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  {
    name: "Hacker News",
    url: 'https://hnrss.org/newest?q="creator+economy"+OR+"newsletter+platform"+OR+"content+creator"+monetization',
  },
];

export interface Article {
  title: string;
  link: string;
  source: string;
  date: string;
  snippet: string;
  relevance_score?: number;
}

const CACHE_TTL_HOURS = 8;

export async function getCachedArticles(): Promise<Article[] | null> {
  const supabase = getSupabase();
  const cutoff = new Date(
    Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from("discover_cache")
    .select("*")
    .eq("source_type", "rss")
    .gte("cached_at", cutoff)
    .gte("relevance_score", 7)
    .order("date", { ascending: false });

  if (data && data.length > 0) {
    return data.map((d) => ({
      title: d.title,
      link: d.link,
      source: d.source,
      date: d.date,
      snippet: d.snippet,
      relevance_score: d.relevance_score,
    }));
  }
  return null;
}

export async function scoreArticles(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return [];

  const titlesBlock = articles
    .map((a, i) => `${i}. ${a.title} [${a.source}]`)
    .join("\n");

  try {
    const text = await generateText(
      `You score news articles for relevance to Aloud, a product studio that builds digital products for content creators (courses, newsletters, communities, apps, monetization tools).

Score each article 1-10:
- 8-10: Directly about creator economy, creator monetization, newsletter/podcast/community platforms, digital product launches for creators
- 5-7: Related to content creation, social media platforms, media business models, audience building
- 1-4: Unrelated (general tech, politics, sports, local news, entertainment gossip)

Return ONLY a JSON array of scores in order, like [8, 3, 7, ...]`,
      `Score these articles:\n${titlesBlock}`,
      { model: "flash", maxTokens: 1000 }
    );

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return articles.map((a) => ({ ...a, relevance_score: 5 }));

    const scores: number[] = JSON.parse(match[0]);
    return articles.map((a, i) => ({
      ...a,
      relevance_score: scores[i] ?? 5,
    }));
  } catch {
    // If scoring fails (e.g. API unavailable), assign default score so articles aren't lost
    return articles.map((a) => ({ ...a, relevance_score: 5 }));
  }
}

export async function fetchFreshArticles(): Promise<Article[]> {
  const allFeeds = [
    ...STATIC_FEEDS,
    ...KEYWORDS.map((kw) => ({
      name: `Google News`,
      url: buildGoogleNewsUrl(kw),
    })),
  ];

  const results = await Promise.allSettled(
    allFeeds.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return (parsed.items || []).slice(0, 8).map((item) => ({
        title: item.title || "Untitled",
        link: item.link || "",
        source: feed.name,
        date: item.pubDate || item.isoDate || "",
        snippet: (item.contentSnippet || item.content || "").slice(0, 200),
      }));
    })
  );

  const articles: Article[] = [];
  const seenLinks = new Set<string>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const article of result.value) {
        if (article.link && !seenLinks.has(article.link)) {
          seenLinks.add(article.link);
          articles.push(article);
        }
      }
    }
  }

  articles.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return articles;
}

export async function cacheArticles(articles: Article[]) {
  const supabase = getSupabase();

  const rows = articles.map((a) => ({
    title: a.title,
    link: a.link,
    source: a.source,
    date: a.date || null,
    snippet: a.snippet,
    relevance_score: a.relevance_score ?? 0,
    source_type: "rss",
    cached_at: new Date().toISOString(),
  }));

  await supabase.from("discover_cache").upsert(rows, { onConflict: "link" });
}

export async function fetchAndCacheNews(): Promise<Article[]> {
  const raw = await fetchFreshArticles();
  if (raw.length === 0) return [];
  const scored = await scoreArticles(raw);
  await cacheArticles(scored).catch(() => {});
  const relevant = scored.filter((a) => (a.relevance_score ?? 0) >= 7);
  // If scoring failed/unavailable, return most recent articles as fallback
  return relevant.length > 0 ? relevant.slice(0, 30) : scored.slice(0, 10);
}
