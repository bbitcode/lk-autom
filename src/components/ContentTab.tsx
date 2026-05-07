"use client";

import { useState, useEffect } from "react";
import {
  Account,
  ContentItem,
  Platform,
  Language,
} from "@/lib/types";

interface MemberOption {
  id: string;
  name: string;
  language: string;
}

type InputMode = "idea" | "url";

export function ContentTab({
  account,
  initialUrl,
  onConsumeInitialUrl,
}: {
  account: Account | null;
  initialUrl?: string;
  onConsumeInitialUrl?: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [inputMode, setInputMode] = useState<InputMode>("idea");
  const [copyInput, setCopyInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [focusInput, setFocusInput] = useState("");
  const [copyLanguage, setCopyLanguage] = useState<Language>("es");
  const [memberName, setMemberName] = useState("");
  const [accountMembersList, setAccountMembersList] = useState<MemberOption[]>([]);
  const [useAICopy, setUseAICopy] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill URL when DiscoverPanel routes here with an article.
  useEffect(() => {
    if (initialUrl) {
      setInputMode("url");
      setUrlInput(initialUrl);
      onConsumeInitialUrl?.();
    }
  }, [initialUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!account) return;
    fetch(`/api/accounts/${account.id}/members`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setAccountMembersList(list);
        if (list.length > 0 && !memberName) setMemberName(list[0].name);
      });
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (!account) return;
    if (inputMode === "idea" && !copyInput.trim()) return;
    if (inputMode === "url" && !urlInput.trim()) return;

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      // URL mode always uses AI; manual toggle is irrelevant there.
      const effectiveSourceType = inputMode === "url" ? "ai_generated" : useAICopy ? "ai_generated" : "manual";

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.id,
          platform,
          copy_input: inputMode === "idea" ? copyInput || undefined : undefined,
          url: inputMode === "url" ? urlInput || undefined : undefined,
          focus: inputMode === "url" ? focusInput || undefined : undefined,
          copy_language: copyLanguage,
          member_name: memberName,
          source_type: effectiveSourceType,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to generate content");
    }
    setGenerating(false);
  };

  if (!account) {
    return <p className="text-zinc-400 text-sm">Loading accounts...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Platform selector */}
      <div>
        <label className="text-xs text-zinc-400 mb-2 block">Platform</label>
        <div className="flex gap-2">
          {(["linkedin", "instagram", "twitter"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-4 py-2 text-sm rounded-md capitalize ${
                platform === p ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {p === "twitter" ? "Twitter / X" : p}
            </button>
          ))}
        </div>
      </div>

      {/* Copy input */}
      <div className="space-y-3">
        {/* Input mode switcher */}
        <div className="flex gap-2">
          {(["idea", "url"] as InputMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setInputMode(m)}
              className={`px-3 py-1.5 text-xs rounded-md ${
                inputMode === m ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {m === "idea" ? "From idea" : "From URL"}
            </button>
          ))}
        </div>

        {inputMode === "idea" ? (
          <>
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 block">
                {useAICopy ? "Idea or topic for the copy" : "Final copy (saved as-is)"}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAICopy}
                  onChange={(e) => setUseAICopy(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs text-zinc-500">Mejorar con IA</span>
              </label>
            </div>
            <textarea
              placeholder={useAICopy ? "Describe what the post should be about..." : "Paste the final copy you want to save..."}
              value={copyInput}
              onChange={(e) => setCopyInput(e.target.value)}
              rows={useAICopy ? 3 : 6}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm resize-none"
            />
          </>
        ) : (
          <>
            <label className="text-xs text-zinc-400 block">Article URL</label>
            <input
              type="url"
              placeholder="https://..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm"
            />
            <label className="text-xs text-zinc-400 block">Focus / angle (optional)</label>
            <textarea
              placeholder="What angle or take should the post have on this article?"
              value={focusInput}
              onChange={(e) => setFocusInput(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm resize-none"
            />
          </>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Language:</label>
            <select
              value={copyLanguage}
              onChange={(e) => setCopyLanguage(e.target.value as Language)}
              className="px-2 py-1 border border-zinc-200 rounded text-xs bg-white"
            >
              <option value="es">Spanish</option>
              <option value="en">English</option>
            </select>
          </div>
          {(inputMode === "url" || useAICopy) && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">Tone of:</label>
              <select
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="px-2 py-1 border border-zinc-200 rounded text-xs bg-white"
              >
                {accountMembersList.length === 0 && <option value="">No members assigned</option>}
                {accountMembersList.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="px-6 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 text-sm font-medium"
      >
        {generating ? "Generating..." : "Generate"}
      </button>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="border border-zinc-200 rounded-lg p-4 bg-white space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
              Generated
            </span>
            <span className="text-xs text-zinc-400 capitalize">{result.platform}</span>
          </div>

          {result.copy_text && (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Copy</label>
              <p className="text-sm whitespace-pre-wrap leading-relaxed bg-zinc-50 p-3 rounded-lg">
                {result.copy_text}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => navigator.clipboard.writeText(result.copy_text!)}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Copy text
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
