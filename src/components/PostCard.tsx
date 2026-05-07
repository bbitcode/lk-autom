"use client";

import { useState } from "react";
import { ContentItem, PostStatus } from "@/lib/types";

const TEAM = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

export function PostCard({
  post,
  onUpdate,
  onDelete,
}: {
  post: ContentItem;
  onUpdate: (id: string, updates: Partial<ContentItem>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editCopy, setEditCopy] = useState(post.copy_text || "");
  const [refineInput, setRefineInput] = useState("");
  const [refining, setRefining] = useState(false);

  const copyToClipboard = () => {
    if (post.copy_text) navigator.clipboard.writeText(post.copy_text);
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
        <div className="flex items-center gap-2 flex-wrap">
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
          <span className="text-xs text-zinc-400 capitalize">{post.platform}</span>
          {post.copy_language && (
            <span className="text-xs text-zinc-400 uppercase">{post.copy_language}</span>
          )}
          {post.source_type === "manual" && (
            <span className="text-xs text-zinc-400">manual</span>
          )}
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
          <span className="text-xs text-zinc-300">{post.id.slice(0, 8)}</span>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={editCopy}
            onChange={(e) => setEditCopy(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                onUpdate(post.id, { copy_text: editCopy || null });
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
          {post.copy_text || "No content"}
        </p>
      )}

      {!editing && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Refine: e.g. 'make it shorter', 'more casual tone'..."
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
                  })
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
                used_by: e.target.value || null,
              })
            }
            className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white"
          >
            <option value="">Not assigned</option>
            {TEAM.map((name) => (
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
