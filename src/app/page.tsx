"use client";

import { useState, useEffect, useCallback } from "react";
import { Post, TeamMember, PostStatus, Language, Account } from "@/lib/types";
import { PostCard } from "@/components/PostCard";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ContentTab } from "@/components/ContentTab";
import { ImageGallery } from "@/components/ImageGallery";
import { AccountSwitcher } from "@/components/AccountSwitcher";

const TEAM: TeamMember[] = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

type Tab = "content" | "posts" | "gallery" | "generate" | "discover" | "settings";

export default function Home() {
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Filters
  const [filterLang, setFilterLang] = useState<Language | "all">("all");
  const [filterStatus, setFilterStatus] = useState<PostStatus | "all">("all");
  const [filterUsedBy, setFilterUsedBy] = useState<string>("all");

  // Generate form
  const [genType, setGenType] = useState<"url" | "idea">("url");
  const [genInput, setGenInput] = useState("");
  const [genMember, setGenMember] = useState<TeamMember>("Daniel");
  const [genFocus, setGenFocus] = useState("");

  // Tabs
  const [tab, setTab] = useState<Tab>("content");

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
          <h1 className="text-2xl font-bold mb-6">Aloud Content Lab</h1>
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

  const TABS: { key: Tab; label: string }[] = [
    { key: "content", label: "Content" },
    { key: "posts", label: "Posts" },
    { key: "gallery", label: "Gallery" },
    { key: "generate", label: "Generate" },
    { key: "discover", label: "Discover" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Aloud Content Lab</h1>
          <p className="text-sm text-zinc-500">Logged in as {currentUser}</p>
        </div>
        <div className="flex items-center gap-4">
          <AccountSwitcher
            selected={selectedAccount}
            onSelect={setSelectedAccount}
          />
          <button
            onClick={() => setCurrentUser(null)}
            className="text-sm text-zinc-400 hover:text-zinc-600"
          >
            Switch user
          </button>
        </div>
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

      {/* Content tab (NEW) */}
      {tab === "content" && <ContentTab account={selectedAccount} />}

      {/* Gallery tab (NEW) */}
      {tab === "gallery" && <ImageGallery account={selectedAccount} />}

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
            <p className="text-zinc-400 text-sm">No posts yet. Go to Generate to create some.</p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onUpdate={updatePost} onDelete={deletePost} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate tab (legacy LinkedIn) */}
      {tab === "generate" && (
        <div className="max-w-xl">
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setGenType("url")}
              className={`px-4 py-2 text-sm rounded-md ${
                genType === "url" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              From URL
            </button>
            <button
              onClick={() => setGenType("idea")}
              className={`px-4 py-2 text-sm rounded-md ${
                genType === "idea" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
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
                  placeholder="Additional focus or angle (optional)..."
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
                    <option key={name} value={name}>{name}</option>
                  ))}
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
