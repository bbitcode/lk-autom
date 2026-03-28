"use client";

import { useState } from "react";
import {
  Account,
  ContentItem,
  Platform,
  ContentType,
  ImageFormat,
  ImageModel,
  Language,
  TeamMember,
} from "@/lib/types";

const TEAM: TeamMember[] = ["Daniel", "Natalia", "Tomás", "Isa", "Jorge"];

const FORMATS: { value: ImageFormat; label: string; icon: string }[] = [
  { value: "1:1", label: "Square", icon: "1:1" },
  { value: "4:5", label: "Vertical", icon: "4:5" },
  { value: "9:16", label: "Story", icon: "9:16" },
  { value: "16:9", label: "Landscape", icon: "16:9" },
];

const IMAGE_MODELS: { value: ImageModel; label: string; desc: string }[] = [
  { value: "imagen-3", label: "Imagen 3", desc: "Realistic photos" },
  { value: "imagen-4", label: "Imagen 4", desc: "Next-gen realistic" },
  { value: "nano-banana", label: "Nano Banana", desc: "Creative / design" },
];

export function ContentTab({ account }: { account: Account | null }) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [contentType, setContentType] = useState<ContentType>("copy_and_image");
  const [copyInput, setCopyInput] = useState("");
  const [copyLanguage, setCopyLanguage] = useState<Language>("es");
  const [memberName, setMemberName] = useState<TeamMember>("Daniel");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("1:1");
  const [imageModel, setImageModel] = useState<ImageModel>("imagen-3");
  const [useBrandStyle, setUseBrandStyle] = useState(true);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!account) return;
    if (contentType !== "image_only" && !copyInput.trim()) return;
    if (contentType !== "copy_only" && !imagePrompt.trim() && !copyInput.trim()) return;

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      // Convert reference image to base64 if present
      let referenceImageBase64: string | undefined;
      if (referenceFile) {
        const buffer = await referenceFile.arrayBuffer();
        referenceImageBase64 = Buffer.from(buffer).toString("base64");
      }

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.id,
          platform,
          content_type: contentType,
          copy_input: copyInput || undefined,
          copy_language: copyLanguage,
          member_name: memberName,
          image_prompt: imagePrompt || undefined,
          image_format: imageFormat,
          image_model: imageModel,
          use_brand_style: useBrandStyle,
          reference_image_base64: referenceImageBase64,
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

  const handleRegenImage = async () => {
    if (!result) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/content/regenerate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_item_id: result.id,
          prompt: imagePrompt || undefined,
          image_format: imageFormat,
          image_model: imageModel,
        }),
      });
      const data = await res.json();
      if (!data.error) setResult(data);
    } catch {
      /* ignore */
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
              onClick={() => {
                setPlatform(p);
                if (p === "instagram") setImageFormat("1:1");
                else if (p === "twitter") setImageFormat("16:9");
                else setImageFormat("16:9");
              }}
              className={`px-4 py-2 text-sm rounded-md capitalize ${
                platform === p ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {p === "twitter" ? "Twitter / X" : p}
            </button>
          ))}
        </div>
      </div>

      {/* Content type selector */}
      <div>
        <label className="text-xs text-zinc-400 mb-2 block">What to generate</label>
        <div className="flex gap-2">
          {(
            [
              { value: "copy_and_image", label: "Copy + Image" },
              { value: "copy_only", label: "Copy only" },
              { value: "image_only", label: "Image only" },
            ] as { value: ContentType; label: string }[]
          ).map((ct) => (
            <button
              key={ct.value}
              onClick={() => setContentType(ct.value)}
              className={`px-4 py-2 text-sm rounded-md ${
                contentType === ct.value
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </div>

      {/* Copy input */}
      {contentType !== "image_only" && (
        <div className="space-y-3">
          <label className="text-xs text-zinc-400 block">Idea or topic for the copy</label>
          <textarea
            placeholder="Describe what the post should be about..."
            value={copyInput}
            onChange={(e) => setCopyInput(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm resize-none"
          />
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
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">Tone of:</label>
              <select
                value={memberName}
                onChange={(e) => setMemberName(e.target.value as TeamMember)}
                className="px-2 py-1 border border-zinc-200 rounded text-xs bg-white"
              >
                {TEAM.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Image options */}
      {contentType !== "copy_only" && (
        <div className="space-y-3">
          <label className="text-xs text-zinc-400 block">Image prompt</label>
          <textarea
            placeholder="Describe the image you want to generate..."
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border border-zinc-200 rounded-lg text-sm resize-none"
          />

          <div className="flex flex-wrap items-center gap-4">
            {/* Format */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Format</label>
              <div className="flex gap-1">
                {FORMATS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setImageFormat(f.value)}
                    className={`px-3 py-1.5 text-xs rounded-md ${
                      imageFormat === f.value
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {f.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Model</label>
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value as ImageModel)}
                className="px-3 py-1.5 border border-zinc-200 rounded-md text-xs bg-white"
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} — {m.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand style toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useBrandStyle}
                onChange={(e) => setUseBrandStyle(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-zinc-500">Use brand style</span>
            </label>
          </div>

          {/* Reference image (one-time, not saved) */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">
              Reference image (optional, one-time — won&apos;t be saved as permanent reference)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setReferenceFile(f);
                  if (f) {
                    const url = URL.createObjectURL(f);
                    setReferencePreview(url);
                  } else {
                    setReferencePreview(null);
                  }
                }}
                className="text-xs"
              />
              {referencePreview && (
                <div className="relative">
                  <img src={referencePreview} alt="Reference" className="w-16 h-16 object-cover rounded border border-zinc-200" />
                  <button
                    onClick={() => { setReferenceFile(null); setReferencePreview(null); }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full leading-none"
                  >
                    x
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
            <span className="text-xs text-zinc-400">{result.content_type}</span>
          </div>

          <div className="flex gap-4">
            {/* Copy preview */}
            {result.copy_text && (
              <div className="flex-1 min-w-0">
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

            {/* Image preview */}
            {result.image_public_url && (
              <div className={result.copy_text ? "w-64 shrink-0" : "flex-1"}>
                <label className="text-xs text-zinc-400 mb-1 block">
                  Image ({result.image_format})
                </label>
                <img
                  src={result.image_public_url}
                  alt="Generated"
                  className="w-full rounded-lg border border-zinc-200"
                />
                <div className="flex gap-2 mt-2">
                  <a
                    href={result.image_public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    Download
                  </a>
                  <button
                    onClick={handleRegenImage}
                    disabled={generating}
                    className="text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
