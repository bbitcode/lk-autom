"use client";

import { useState, useEffect, useCallback } from "react";
import { Post, TeamMember, PostStatus, Language } from "@/lib/types";

const TEAM: TeamMember[] = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

export default function Home() {
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Filters
  const [filterLang, setFilterLang] = useState<Language | "all">("all");
  const [filterStatus, setFilterStatus] = useState<PostStatus | "all">("all");
  const [filterUsedBy, setFilterUsedBy] = useState<string>("all");

  // Generate form
  const [genType, setGenType] = useState<"url" | "idea">("url");
  const [genInput, setGenInput] = useState("");
  const [genMember, setGenMember] = useState<TeamMember>("Daniel");
  const [genModel, setGenModel] = useState("claude-sonnet-4-20250514");
  const [genFocus, setGenFocus] = useState("");

  // Tabs
  const [tab, setTab] = useState<"posts" | "generate" | "discover" | "settings">("posts");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterLang !== "all") params.set("language", filterLang);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterUsedBy !== "all") params.set("used_by", filterUsedBy);

    const res = await fetch(`/api/posts?${params}`);
    const data = await res.json();
    setPosts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterLang, filterStatus, filterUsedBy]);

  useEffect(() => {
    if (currentUser) fetchPosts();
  }, [currentUser, filterLang, filterStatus, filterUsedBy, fetchPosts]);

  const handleGenerate = async () => {
    if (!genInput.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: genType,
          [genType === "url" ? "url" : "idea"]: genInput,
          member_name: genMember,
          model: genModel,
          focus: genType === "url" ? genFocus : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert("Error: " + data.error);
      } else {
        setGenInput("");
        setTab("posts");
        fetchPosts();
      }
    } catch {
      alert("Error generating post");
    }
    setGenerating(false);
  };

  const updatePost = async (id: string, updates: Partial<Post>) => {
    await fetch("/api/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    fetchPosts();
  };

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await fetch("/api/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchPosts();
  };

  // User selector
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-6">Aloud Post Generator</h1>
          <p className="text-zinc-500 mb-8">Who are you?</p>
          <div className="flex flex-col gap-3">
            {TEAM.map((name) => (
              <button
                key={name}
                onClick={() => {
                  setCurrentUser(name);
                  setGenMember(name);
                }}
                className="px-8 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors text-lg"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold">Aloud Posts</h1>
          <p className="text-sm text-zinc-500">Logged in as {currentUser}</p>
        </div>
        <button
          onClick={() => setCurrentUser(null)}
          className="text-sm text-zinc-400 hover:text-zinc-600"
        >
          Switch user
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200">
        {(["posts", "generate", "discover", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {t === "generate" ? "Generate" : t === "discover" ? "Discover" : t === "settings" ? "Settings" : "Posts"}
          </button>
        ))}
      </div>

      {/* Posts tab */}
      {tab === "posts" && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <select
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value as Language | "all")}
              className="px-3 py-1.5 border border-zinc-200 rounded-md text-sm bg-white"
            >
              <option value="all">All languages</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as PostStatus | "all")}
              className="px-3 py-1.5 border border-zinc-200 rounded-md text-sm bg-white"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="used">Used</option>
            </select>
            <select
              value={filterUsedBy}
              onChange={(e) => setFilterUsedBy(e.target.value)}
              className="px-3 py-1.5 border border-zinc-200 rounded-md text-sm bg-white"
            >
              <option value="all">All people</option>
              {TEAM.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Posts list */}
          {loading ? (
            <p className="text-zinc-400 text-sm">Loading...</p>
          ) : posts.length === 0 ? (
            <p className="text-zinc-400 text-sm">
              No posts yet. Go to Generate to create some.
            </p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onUpdate={updatePost}
                  onDelete={deletePost}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate tab */}
      {tab === "generate" && (
        <div className="max-w-xl">
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setGenType("url")}
              className={`px-4 py-2 text-sm rounded-md ${
                genType === "url"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              From URL
            </button>
            <button
              onClick={() => setGenType("idea")}
              className={`px-4 py-2 text-sm rounded-md ${
                genType === "idea"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              From idea
            </button>
          </div>

          <div className="space-y-4">
            {genType === "url" ? (
              <div className="space-y-3">
                <input
                  type="url"
                  placeholder="Paste a URL to generate a post from..."
                  value={genInput}
                  onChange={(e) => setGenInput(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm"
                />
                <textarea
                  placeholder="Additional focus or angle (optional)... e.g. 'Focus on the monetization strategy and how it relates to what we do at Aloud'"
                  value={genFocus}
                  onChange={(e) => setGenFocus(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm resize-none"
                />
              </div>
            ) : (
              <textarea
                placeholder="Describe your post idea..."
                value={genInput}
                onChange={(e) => setGenInput(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm resize-none"
              />
            )}

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <label className="text-sm text-zinc-500">Tone of:</label>
                <select
                  value={genMember}
                  onChange={(e) => setGenMember(e.target.value as TeamMember)}
                  className="px-3 py-1.5 border border-zinc-200 rounded-md text-sm bg-white"
                >
                  {TEAM.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-zinc-500">Model:</label>
                <select
                  value={genModel}
                  onChange={(e) => setGenModel(e.target.value)}
                  className="px-3 py-1.5 border border-zinc-200 rounded-md text-sm bg-white"
                >
                  <option value="claude-sonnet-4-20250514">Sonnet (buen balance)</option>
                  <option value="claude-opus-4-20250514">Opus (mejor calidad, más caro)</option>
                  <option value="claude-haiku-4-5-20251001">Haiku (rápido y barato)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !genInput.trim()}
              className="px-6 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {generating ? "Generating..." : "Generate Post"}
            </button>
          </div>
        </div>
      )}

      {/* Discover tab */}
      {tab === "discover" && (
        <DiscoverPanel
          onGenerate={(url: string) => {
            setGenInput(url);
            setGenType("url");
            setTab("generate");
          }}
        />
      )}

      {/* Settings tab */}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}

// ---------- PostCard Component ----------

function PostCard({
  post,
  onUpdate,
  onDelete,
}: {
  post: Post;
  onUpdate: (id: string, updates: Partial<Post>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editEn, setEditEn] = useState(post.content_en || "");
  const [editEs, setEditEs] = useState(post.content_es || "");
  const [refineInput, setRefineInput] = useState("");
  const [refining, setRefining] = useState(false);
  const [showLang, setShowLang] = useState<"en" | "es">(
    post.content_en ? "en" : "es"
  );

  const content = showLang === "en" ? post.content_en : post.content_es;
  const copyToClipboard = () => {
    if (content) navigator.clipboard.writeText(content);
  };

  const handleRefine = async () => {
    if (!refineInput.trim()) return;
    setRefining(true);
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: post.id,
          instruction: refineInput,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert("Error: " + data.error);
      } else {
        setRefineInput("");
        onUpdate(post.id, {});
      }
    } catch {
      alert("Error refining post");
    }
    setRefining(false);
  };

  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              post.status === "draft"
                ? "bg-yellow-100 text-yellow-700"
                : post.status === "ready"
                ? "bg-green-100 text-green-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {post.status}
          </span>
          {post.used_by && (
            <span className="text-xs text-zinc-400">
              Used by {post.used_by}
            </span>
          )}
          {post.source_url && (
            <a
              href={post.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline truncate max-w-[200px]"
            >
              Source
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {post.content_en && post.content_es && (
            <div className="flex border border-zinc-200 rounded-md overflow-hidden">
              <button
                onClick={() => setShowLang("en")}
                className={`px-2 py-0.5 text-xs ${
                  showLang === "en" ? "bg-zinc-900 text-white" : "text-zinc-400"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setShowLang("es")}
                className={`px-2 py-0.5 text-xs ${
                  showLang === "es" ? "bg-zinc-900 text-white" : "text-zinc-400"
                }`}
              >
                ES
              </button>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">English</label>
            <textarea
              value={editEn}
              onChange={(e) => setEditEn(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Spanish</label>
            <textarea
              value={editEs}
              onChange={(e) => setEditEs(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onUpdate(post.id, {
                  content_en: editEn || null,
                  content_es: editEs || null,
                } as Partial<Post>);
                setEditing(false);
              }}
              className="px-3 py-1.5 bg-zinc-900 text-white text-xs rounded-md"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-zinc-400 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap leading-relaxed mb-3">
          {content || "No content for this language"}
        </p>
      )}

      {!editing && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Refine: e.g. 'make it shorter', 'more casual tone', 'add a question at the end'..."
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && refineInput.trim()) handleRefine();
            }}
            className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-md text-xs"
          />
          <button
            onClick={handleRefine}
            disabled={refining || !refineInput.trim()}
            className="px-3 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50 shrink-0"
          >
            {refining ? "Refining..." : "Refine"}
          </button>
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
          <button
            onClick={copyToClipboard}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            Copy
          </button>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            Edit
          </button>
          <select
            value={post.status}
            onChange={(e) =>
              onUpdate(post.id, { status: e.target.value as PostStatus })
            }
            className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white"
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="used">Used</option>
          </select>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() =>
                  onUpdate(post.id, {
                    rating: post.rating === star ? null : star,
                  } as Partial<Post>)
                }
                className={`text-sm ${
                  post.rating && star <= post.rating
                    ? "text-yellow-400"
                    : "text-zinc-200 hover:text-yellow-300"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          <select
            value={post.used_by || ""}
            onChange={(e) =>
              onUpdate(post.id, {
                used_by: (e.target.value || null) as TeamMember | null,
              })
            }
            className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white"
          >
            <option value="">Not assigned</option>
            {["Daniel", "Natalia", "Tomás", "Isa", "Jorge"].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={() => onDelete(post.id)}
            className="text-xs text-red-400 hover:text-red-600 ml-auto"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Discover Panel ----------

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

function DiscoverPanel({ onGenerate }: { onGenerate: (url: string) => void }) {
  const [subtab, setSubtab] = useState<"feeds" | "sites">("feeds");

  // RSS feeds state
  const [feedArticles, setFeedArticles] = useState<Article[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(false);

  // Scraped sites state
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

  // Load feeds on first render
  useEffect(() => {
    if (!feedLoaded) loadFeeds();
  }, [feedLoaded, loadFeeds]);

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1">
          <button
            onClick={() => setSubtab("feeds")}
            className={`px-4 py-2 text-sm rounded-md ${
              subtab === "feeds"
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600"
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
              subtab === "sites"
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600"
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
          {(subtab === "feeds" ? feedLoading : siteLoading)
            ? "Loading..."
            : "Refresh"}
        </button>
      </div>

      {/* Feeds tab */}
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

      {/* Sites tab */}
      {subtab === "sites" && (
        <div>
          <p className="text-xs text-zinc-400 mb-4">
            Creator Spotlight, The Publish Press & Digiday — scraped with Firecrawl, filtered by relevance (7+).
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

// ---------- Settings Panel ----------

function SettingsPanel() {
  interface MemberData {
    id: string;
    name: string;
    language: string;
    tone_description: string | null;
    writing_samples: string | null;
  }

  interface ContextData {
    key: string;
    value: string;
  }

  const [members, setMembers] = useState<MemberData[]>([]);
  const [context, setContext] = useState<ContextData[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members || []);
        setContext(data.context || []);
      });
  }, []);

  const saveMember = async (member: MemberData) => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "member",
        id: member.id,
        tone_description: member.tone_description,
        writing_samples: member.writing_samples,
        language: member.language,
      }),
    });
    setSaving(false);
  };

  const saveContext = async (key: string, value: string) => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "context", key, value }),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-4">Team Members</h2>
        <div className="space-y-6">
          {members.map((member, i) => (
            <div
              key={member.id}
              className="border border-zinc-200 rounded-lg p-4 bg-white"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="font-medium">{member.name}</span>
                <select
                  value={member.language}
                  onChange={(e) => {
                    const updated = [...members];
                    updated[i] = { ...member, language: e.target.value };
                    setMembers(updated);
                  }}
                  className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    Tone description
                  </label>
                  <textarea
                    value={member.tone_description || ""}
                    onChange={(e) => {
                      const updated = [...members];
                      updated[i] = {
                        ...member,
                        tone_description: e.target.value,
                      };
                      setMembers(updated);
                    }}
                    rows={2}
                    placeholder="e.g. Direct, data-driven, uses analogies..."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    Writing samples (paste examples of their writing)
                  </label>
                  <textarea
                    value={member.writing_samples || ""}
                    onChange={(e) => {
                      const updated = [...members];
                      updated[i] = {
                        ...member,
                        writing_samples: e.target.value,
                      };
                      setMembers(updated);
                    }}
                    rows={4}
                    placeholder="Paste example posts or text here..."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
                  />
                </div>
                <button
                  onClick={() => saveMember(members[i])}
                  disabled={saving}
                  className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Company Context</h2>
        <div className="space-y-4">
          {context.map((item, i) => (
            <div key={item.key} className="border border-zinc-200 rounded-lg p-4 bg-white">
              <label className="text-sm font-medium mb-1 block capitalize">
                {item.key.replace(/_/g, " ")}
              </label>
              <textarea
                value={item.value}
                onChange={(e) => {
                  const updated = [...context];
                  updated[i] = { ...item, value: e.target.value };
                  setContext(updated);
                }}
                rows={3}
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none mb-2"
              />
              <button
                onClick={() => saveContext(item.key, context[i].value)}
                disabled={saving}
                className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
