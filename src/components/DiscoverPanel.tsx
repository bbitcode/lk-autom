"use client";

import { useState, useEffect, useCallback } from "react";

interface Article {
  title: string;
  link: string;
  source: string;
  date: string;
  snippet: string;
  relevance_score?: number;
}

function ArticleList({
  articles,
  onGenerate,
}: {
  articles: Article[];
  onGenerate: (url: string) => void;
}) {
  if (articles.length === 0) {
    return <p className="text-zinc-400 text-sm">No relevant articles found.</p>;
  }

  return (
    <div className="space-y-3">
      {articles.map((article, i) => (
        <div
          key={`${article.link}-${i}`}
          className="border border-zinc-200 rounded-lg p-4 bg-white flex justify-between gap-4"
        >
          <div className="min-w-0 flex-1">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline line-clamp-2"
            >
              {article.title}
            </a>
            {article.snippet && (
              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                {article.snippet}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-zinc-300">{article.source}</span>
              {article.date && (
                <span className="text-xs text-zinc-300">
                  {new Date(article.date).toLocaleDateString()}
                </span>
              )}
              {article.relevance_score && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    article.relevance_score >= 8
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {article.relevance_score}/10
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onGenerate(article.link)}
            className="px-3 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 shrink-0 h-fit"
          >
            Use
          </button>
        </div>
      ))}
    </div>
  );
}

export function DiscoverPanel({ onGenerate }: { onGenerate: (url: string) => void }) {
  const [subtab, setSubtab] = useState<"feeds" | "sites">("feeds");
  const [feedArticles, setFeedArticles] = useState<Article[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [siteArticles, setSiteArticles] = useState<Article[]>([]);
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteLoaded, setSiteLoaded] = useState(false);

  const loadFeeds = useCallback(() => {
    setFeedLoading(true);
    fetch("/api/discover")
      .then((r) => r.json())
      .then((data) => {
        setFeedArticles(Array.isArray(data) ? data : []);
        setFeedLoading(false);
        setFeedLoaded(true);
      })
      .catch(() => {
        setFeedLoading(false);
        setFeedLoaded(true);
      });
  }, []);

  const loadSites = useCallback(() => {
    setSiteLoading(true);
    fetch("/api/discover/scrape", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setSiteArticles(Array.isArray(data.articles) ? data.articles : []);
        setSiteLoading(false);
        setSiteLoaded(true);
      })
      .catch(() => {
        setSiteLoading(false);
        setSiteLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!feedLoaded) loadFeeds();
  }, [feedLoaded, loadFeeds]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1">
          <button
            onClick={() => setSubtab("feeds")}
            className={`px-4 py-2 text-sm rounded-md ${
              subtab === "feeds" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            RSS Feeds
          </button>
          <button
            onClick={() => {
              setSubtab("sites");
              if (!siteLoaded) loadSites();
            }}
            className={`px-4 py-2 text-sm rounded-md ${
              subtab === "sites" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            Scraped Sites
          </button>
        </div>
        <button
          onClick={async () => {
            if (subtab === "feeds") {
              await fetch("/api/discover/refresh", { method: "POST" });
              loadFeeds();
            } else {
              loadSites();
            }
          }}
          disabled={subtab === "feeds" ? feedLoading : siteLoading}
          className="px-3 py-1.5 text-xs border border-zinc-200 rounded-md hover:bg-zinc-50 disabled:opacity-50"
        >
          {(subtab === "feeds" ? feedLoading : siteLoading) ? "Loading..." : "Refresh"}
        </button>
      </div>

      {subtab === "feeds" && (
        <div>
          <p className="text-xs text-zinc-400 mb-4">
            Google News, TechCrunch & Hacker News — filtered by relevance (7+). Cached 8 hours.
          </p>
          {feedLoading ? (
            <p className="text-zinc-400 text-sm">Loading feeds...</p>
          ) : (
            <ArticleList articles={feedArticles} onGenerate={onGenerate} />
          )}
        </div>
      )}

      {subtab === "sites" && (
        <div>
          <p className="text-xs text-zinc-400 mb-4">
            Creator Spotlight, The Publish Press & Digiday — scraped with Firecrawl.
          </p>
          {siteLoading ? (
            <p className="text-zinc-400 text-sm">Scraping sites (this takes ~15s)...</p>
          ) : (
            <ArticleList articles={siteArticles} onGenerate={onGenerate} />
          )}
        </div>
      )}
    </div>
  );
}
