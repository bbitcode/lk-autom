"use client";

import { useState, useEffect, useCallback } from "react";
import { ContentItem, TeamMember, PostStatus, Language, Account } from "@/lib/types";
import { PostCard } from "@/components/PostCard";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ContentTab } from "@/components/ContentTab";

const TEAM: TeamMember[] = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

type Tab = "content" | "posts" | "discover" | "settings";

export default function Home() {
  const [authState, setAuthState] = useState<"checking" | "out" | "in">("checking");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);

  // Filters
  const [filterLang, setFilterLang] = useState<Language | "all">("all");
  const [filterStatus, setFilterStatus] = useState<PostStatus | "all">("all");
  const [filterUsedBy, setFilterUsedBy] = useState<string>("all");

  // URL handed off from Discover → Content
  const [discoverUrl, setDiscoverUrl] = useState<string | undefined>(undefined);

  const [tab, setTab] = useState<Tab>("content");

  // Check auth on mount
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setAuthState(d.authed ? "in" : "out"))
      .catch(() => setAuthState("out"));
  }, []);

  // Once authed, load the (single) Aloud account
  useEffect(() => {
    if (authState !== "in") return;
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const list: Account[] = Array.isArray(data) ? data : [];
        const def = list.find((a) => a.is_default) || list[0] || null;
        setAccount(def);
      });
  }, [authState]);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    const res = await fetch(`/api/content?${params}`);
    const data = await res.json();
    let items: ContentItem[] = Array.isArray(data) ? data : [];
    // Client-side filters that the /api/content endpoint doesn't support directly.
    if (filterLang !== "all") items = items.filter((i) => i.copy_language === filterLang);
    if (filterUsedBy !== "all") items = items.filter((i) => i.used_by === filterUsedBy);
    setPosts(items);
    setLoading(false);
  }, [filterLang, filterStatus, filterUsedBy]);

  useEffect(() => {
    if (authState === "in") fetchPosts();
  }, [authState, filterLang, filterStatus, filterUsedBy, fetchPosts]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput }),
    });
    setAuthSubmitting(false);
    if (res.ok) {
      setAuthState("in");
      setPasswordInput("");
    } else {
      const data = await res.json().catch(() => ({}));
      setAuthError(data.error || "Wrong password");
    }
  };

  const logout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setAuthState("out");
  };

  const updatePost = async (id: string, updates: Partial<ContentItem>) => {
    await fetch(`/api/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    fetchPosts();
  };

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/content/${id}`, { method: "DELETE" });
    fetchPosts();
  };

  if (authState === "checking") {
    return <div className="min-h-screen flex items-center justify-center text-sm text-zinc-400">Loading…</div>;
  }

  if (authState === "out") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <form onSubmit={submitPassword} className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-2">Aloud Content Lab</h1>
          <p className="text-zinc-500 mb-8">Enter the team password to continue.</p>
          <input
            type="password"
            autoFocus
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm mb-3"
          />
          {authError && (
            <p className="text-xs text-red-500 mb-3">{authError}</p>
          )}
          <button
            type="submit"
            disabled={authSubmitting || !passwordInput}
            className="w-full px-8 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50"
          >
            {authSubmitting ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "content", label: "Content" },
    { key: "posts", label: "Posts" },
    { key: "discover", label: "Discover" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Aloud Content Lab</h1>
        <button
          onClick={logout}
          className="text-sm text-zinc-400 hover:text-zinc-600"
        >
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content tab (single creation surface) */}
      {tab === "content" && (
        <ContentTab
          account={account}
          initialUrl={discoverUrl}
          onConsumeInitialUrl={() => setDiscoverUrl(undefined)}
        />
      )}

      {/* Posts tab */}
      {tab === "posts" && (
        <div>
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
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-zinc-400 text-sm">Loading...</p>
          ) : posts.length === 0 ? (
            <p className="text-zinc-400 text-sm">No posts yet. Use the Content tab to create some.</p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onUpdate={updatePost} onDelete={deletePost} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Discover tab */}
      {tab === "discover" && (
        <DiscoverPanel
          onGenerate={(url: string) => {
            setDiscoverUrl(url);
            setTab("content");
          }}
        />
      )}

      {/* Settings tab */}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}
