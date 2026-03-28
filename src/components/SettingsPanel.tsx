"use client";

import { useState, useEffect } from "react";
import { Account } from "@/lib/types";

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

export function SettingsPanel() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [context, setContext] = useState<ContextData[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  // New account form
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newStyle, setNewStyle] = useState("");
  const [newColors, setNewColors] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members || []);
        setContext(data.context || []);
      });
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(Array.isArray(data) ? data : []));
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

  const createAccount = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        slug: newSlug || newName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        brand_style: newStyle || null,
        color_palette: newColors
          ? newColors.split(",").map((c) => c.trim())
          : [],
      }),
    });
    const data = await res.json();
    if (!data.error) {
      setAccounts([...accounts, data]);
      setNewName("");
      setNewSlug("");
      setNewStyle("");
      setNewColors("");
    }
    setSaving(false);
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("Delete this account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setAccounts(accounts.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-8">
      {/* Accounts / Brands */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Accounts / Brands</h2>
        <div className="space-y-4 mb-6">
          {accounts.map((account, i) => (
            <div key={account.id} className="border border-zinc-200 rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{account.name}</span>
                  <span className="text-xs text-zinc-400">/{account.slug}</span>
                  {account.is_default && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                {!account.is_default && (
                  <button
                    onClick={() => deleteAccount(account.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Brand style</label>
                  <textarea
                    value={account.brand_style || ""}
                    onChange={(e) => {
                      const updated = [...accounts];
                      updated[i] = { ...account, brand_style: e.target.value };
                      setAccounts(updated);
                    }}
                    rows={2}
                    placeholder="Describe the visual style, tone, aesthetic..."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    Color palette (comma-separated hex)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={(account.color_palette || []).join(", ")}
                      onChange={(e) => {
                        const updated = [...accounts];
                        updated[i] = {
                          ...account,
                          color_palette: e.target.value
                            .split(",")
                            .map((c) => c.trim())
                            .filter(Boolean),
                        };
                        setAccounts(updated);
                      }}
                      placeholder="#FF5733, #1A1A2E, #E2E2E2"
                      className="flex-1 px-3 py-2 border border-zinc-200 rounded-md text-sm"
                    />
                    <div className="flex gap-1">
                      {(account.color_palette || []).slice(0, 5).map((color, ci) => (
                        <div
                          key={ci}
                          className="w-6 h-6 rounded border border-zinc-200"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    updateAccount(account.id, {
                      brand_style: account.brand_style,
                      color_palette: account.color_palette,
                    })
                  }
                  disabled={saving}
                  className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* New account form */}
        <div className="border border-dashed border-zinc-300 rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Add new account</h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Account name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 px-3 py-2 border border-zinc-200 rounded-md text-sm"
              />
              <input
                type="text"
                placeholder="slug (optional)"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                className="w-40 px-3 py-2 border border-zinc-200 rounded-md text-sm"
              />
            </div>
            <textarea
              placeholder="Brand style description (optional)"
              value={newStyle}
              onChange={(e) => setNewStyle(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
            />
            <input
              type="text"
              placeholder="Color palette: #FF5733, #1A1A2E (optional)"
              value={newColors}
              onChange={(e) => setNewColors(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm"
            />
            <button
              onClick={createAccount}
              disabled={saving || !newName.trim()}
              className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Team Members</h2>
        <div className="space-y-6">
          {members.map((member, i) => (
            <div key={member.id} className="border border-zinc-200 rounded-lg p-4 bg-white">
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
                  <label className="text-xs text-zinc-400 mb-1 block">Tone description</label>
                  <textarea
                    value={member.tone_description || ""}
                    onChange={(e) => {
                      const updated = [...members];
                      updated[i] = { ...member, tone_description: e.target.value };
                      setMembers(updated);
                    }}
                    rows={2}
                    placeholder="e.g. Direct, data-driven, uses analogies..."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Writing samples</label>
                  <textarea
                    value={member.writing_samples || ""}
                    onChange={(e) => {
                      const updated = [...members];
                      updated[i] = { ...member, writing_samples: e.target.value };
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

      {/* Company Context */}
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
