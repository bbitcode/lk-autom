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

  // Tabs
  const [tab, setTab] = useState<"posts" | "generate" | "settings">("posts");

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
        {(["posts", "generate", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {t === "generate" ? "Generate" : t === "settings" ? "Settings" : "Posts"}
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
              <input
                type="url"
                placeholder="Paste a URL to generate a post from..."
                value={genInput}
                onChange={(e) => setGenInput(e.target.value)}
                className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm"
              />
            ) : (
              <textarea
                placeholder="Describe your post idea..."
                value={genInput}
                onChange={(e) => setGenInput(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm resize-none"
              />
            )}

            <div className="flex items-center gap-3">
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
  const [showLang, setShowLang] = useState<"en" | "es">(
    post.content_en ? "en" : "es"
  );

  const content = showLang === "en" ? post.content_en : post.content_es;
  const copyToClipboard = () => {
    if (content) navigator.clipboard.writeText(content);
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
