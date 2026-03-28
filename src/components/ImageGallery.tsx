"use client";

import { useState, useEffect } from "react";
import { Account, ContentItem } from "@/lib/types";

export function ImageGallery({ account }: { account: Account | null }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    const params = new URLSearchParams({ account_id: account.id });
    fetch(`/api/content?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const all = Array.isArray(data) ? data : [];
        setItems(all.filter((item: ContentItem) => item.image_public_url));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [account]);

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this content?")) return;
    await fetch(`/api/content/${id}`, { method: "DELETE" });
    setItems(items.filter((i) => i.id !== id));
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setItems(items.map((i) => (i.id === id ? { ...i, status: status as ContentItem["status"] } : i)));
  };

  if (!account) return <p className="text-zinc-400 text-sm">Loading...</p>;

  if (loading) return <p className="text-zinc-400 text-sm">Loading gallery...</p>;

  if (items.length === 0) {
    return (
      <p className="text-zinc-400 text-sm">
        No images generated for {account.name} yet. Go to Content to create some.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {items.map((item) => (
        <div key={item.id} className="border border-zinc-200 rounded-lg bg-white overflow-hidden">
          {item.image_public_url && (
            <img
              src={item.image_public_url}
              alt={item.image_prompt || "Generated image"}
              className="w-full aspect-square object-cover"
            />
          )}
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-1">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  item.status === "draft"
                    ? "bg-yellow-100 text-yellow-700"
                    : item.status === "ready"
                    ? "bg-green-100 text-green-700"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {item.status}
              </span>
              <span className="text-xs text-zinc-400 capitalize">{item.platform}</span>
              {item.image_format && (
                <span className="text-xs text-zinc-300">{item.image_format}</span>
              )}
            </div>

            {item.copy_text && (
              <p className="text-xs text-zinc-500 line-clamp-3">{item.copy_text}</p>
            )}

            {item.image_prompt && (
              <p className="text-xs text-zinc-300 line-clamp-2 italic">{item.image_prompt}</p>
            )}

            <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
              <select
                value={item.status}
                onChange={(e) => updateStatus(item.id, e.target.value)}
                className="text-xs border border-zinc-200 rounded px-1.5 py-0.5 bg-white"
              >
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="used">Used</option>
              </select>
              <a
                href={item.image_public_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-400 hover:text-zinc-600"
              >
                Open
              </a>
              {item.copy_text && (
                <button
                  onClick={() => navigator.clipboard.writeText(item.copy_text!)}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Copy text
                </button>
              )}
              <button
                onClick={() => deleteItem(item.id)}
                className="text-xs text-red-400 hover:text-red-600 ml-auto"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
