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
  account_id?: string;
}

interface ReferenceImage {
  id: string;
  public_url: string;
  description: string | null;
  created_at: string;
}

export function SettingsPanel() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  // Per-account context
  const [accountContexts, setAccountContexts] = useState<Record<string, ContextData[]>>({});
  // Per-account references
  const [accountRefs, setAccountRefs] = useState<Record<string, ReferenceImage[]>>({});
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  // New account form
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newStyle, setNewStyle] = useState("");
  const [newColors, setNewColors] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setMembers(data.members || []));
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setAccounts(list);
        // Load context for each account
        list.forEach((a: Account) => loadAccountContext(a.id));
      });
  }, []);

  const loadAccountContext = async (accountId: string) => {
    const res = await fetch(`/api/settings?account_id=${accountId}`);
    const data = await res.json();
    setAccountContexts((prev) => ({ ...prev, [accountId]: data.context || [] }));
  };

  const loadAccountRefs = async (accountId: string) => {
    const res = await fetch(`/api/accounts/${accountId}/references`);
    const data = await res.json();
    setAccountRefs((prev) => ({ ...prev, [accountId]: Array.isArray(data) ? data : [] }));
  };

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

  const saveContext = async (accountId: string, key: string, value: string) => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "context", key, value, account_id: accountId }),
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
        color_palette: newColors ? newColors.split(",").map((c) => c.trim()) : [],
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

  const uploadReference = async (accountId: string, file: File, description: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (description) formData.append("description", description);
    await fetch(`/api/accounts/${accountId}/references`, {
      method: "POST",
      body: formData,
    });
    loadAccountRefs(accountId);
  };

  const deleteReference = async (accountId: string, refId: string) => {
    await fetch(`/api/accounts/${accountId}/references`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference_id: refId }),
    });
    loadAccountRefs(accountId);
  };

  const CONTEXT_KEYS = [
    { key: "company_description", label: "Description" },
    { key: "services", label: "Services" },
    { key: "target_audience", label: "Target Audience" },
    { key: "tone", label: "Tone Guidelines" },
    { key: "notable_clients", label: "Notable Clients" },
  ];

  return (
    <div className="space-y-8">
      {/* Accounts / Brands */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Accounts / Brands</h2>
        <div className="space-y-4 mb-6">
          {accounts.map((account, i) => {
            const isExpanded = expandedAccount === account.id;
            const ctx = accountContexts[account.id] || [];
            const refs = accountRefs[account.id] || [];

            return (
              <div key={account.id} className="border border-zinc-200 rounded-lg bg-white">
                {/* Account header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => {
                    const newId = isExpanded ? null : account.id;
                    setExpandedAccount(newId);
                    if (newId) loadAccountRefs(newId);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{account.name}</span>
                    <span className="text-xs text-zinc-400">/{account.slug}</span>
                    {account.is_default && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Default</span>
                    )}
                    <div className="flex gap-0.5 ml-2">
                      {(account.color_palette || []).slice(0, 4).map((color, ci) => (
                        <div key={ci} className="w-3 h-3 rounded-full border border-zinc-200" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-5 border-t border-zinc-100 pt-4">
                    {/* Brand style */}
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

                    {/* Color palette */}
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Color palette (comma-separated hex)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={(account.color_palette || []).join(", ")}
                          onChange={(e) => {
                            const updated = [...accounts];
                            updated[i] = { ...account, color_palette: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) };
                            setAccounts(updated);
                          }}
                          placeholder="#FF5733, #1A1A2E"
                          className="flex-1 px-3 py-2 border border-zinc-200 rounded-md text-sm"
                        />
                        <div className="flex gap-1">
                          {(account.color_palette || []).slice(0, 5).map((color, ci) => (
                            <div key={ci} className="w-6 h-6 rounded border border-zinc-200" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => updateAccount(account.id, { brand_style: account.brand_style, color_palette: account.color_palette })}
                      disabled={saving}
                      className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50"
                    >
                      Save Brand
                    </button>

                    {/* Context per account */}
                    <div>
                      <h3 className="text-sm font-medium mb-3">Context for {account.name}</h3>
                      <div className="space-y-3">
                        {CONTEXT_KEYS.map((ck) => {
                          const existing = ctx.find((c) => c.key === ck.key);
                          return (
                            <div key={ck.key}>
                              <label className="text-xs text-zinc-400 mb-1 block">{ck.label}</label>
                              <textarea
                                value={existing?.value || ""}
                                onChange={(e) => {
                                  const updated = ctx.filter((c) => c.key !== ck.key);
                                  updated.push({ key: ck.key, value: e.target.value, account_id: account.id });
                                  setAccountContexts((prev) => ({ ...prev, [account.id]: updated }));
                                }}
                                rows={2}
                                placeholder={`${ck.label} for ${account.name}...`}
                                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none"
                              />
                              <button
                                onClick={() => saveContext(account.id, ck.key, ctx.find((c) => c.key === ck.key)?.value || "")}
                                disabled={saving}
                                className="mt-1 px-3 py-1 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Reference images */}
                    <div>
                      <h3 className="text-sm font-medium mb-3">Reference Images</h3>
                      {refs.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {refs.map((ref) => (
                            <div key={ref.id} className="relative group">
                              <img
                                src={ref.public_url}
                                alt={ref.description || "Reference"}
                                className="w-full aspect-square object-cover rounded-lg border border-zinc-200"
                              />
                              {ref.description && (
                                <p className="text-xs text-zinc-400 mt-1 truncate">{ref.description}</p>
                              )}
                              <button
                                onClick={() => deleteReference(account.id, ref.id)}
                                className="absolute top-1 right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <ReferenceUpload
                        onUpload={(file, desc) => uploadReference(account.id, file, desc)}
                      />
                    </div>

                    {/* Delete account */}
                    {!account.is_default && (
                      <div className="pt-3 border-t border-zinc-100">
                        <button
                          onClick={() => deleteAccount(account.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Delete account
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* New account form */}
        <div className="border border-dashed border-zinc-300 rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Add new account</h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              <input type="text" placeholder="Account name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 px-3 py-2 border border-zinc-200 rounded-md text-sm" />
              <input type="text" placeholder="slug (optional)" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} className="w-40 px-3 py-2 border border-zinc-200 rounded-md text-sm" />
            </div>
            <textarea placeholder="Brand style description (optional)" value={newStyle} onChange={(e) => setNewStyle(e.target.value)} rows={2} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none" />
            <input type="text" placeholder="Color palette: #FF5733, #1A1A2E (optional)" value={newColors} onChange={(e) => setNewColors(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm" />
            <button onClick={createAccount} disabled={saving || !newName.trim()} className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50">
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
                <select value={member.language} onChange={(e) => { const updated = [...members]; updated[i] = { ...member, language: e.target.value }; setMembers(updated); }} className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Tone description</label>
                  <textarea value={member.tone_description || ""} onChange={(e) => { const updated = [...members]; updated[i] = { ...member, tone_description: e.target.value }; setMembers(updated); }} rows={2} placeholder="e.g. Direct, data-driven..." className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Writing samples</label>
                  <textarea value={member.writing_samples || ""} onChange={(e) => { const updated = [...members]; updated[i] = { ...member, writing_samples: e.target.value }; setMembers(updated); }} rows={4} placeholder="Paste example posts..." className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none" />
                </div>
                <button onClick={() => saveMember(members[i])} disabled={saving} className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50">Save</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Reference image upload component ---

function ReferenceUpload({ onUpload }: { onUpload: (file: File, description: string) => void }) {
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = () => {
    if (!file) return;
    onUpload(file, desc);
    setFile(null);
    setDesc("");
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full mt-1 px-3 py-1.5 border border-zinc-200 rounded-md text-xs"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!file}
        className="px-3 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50 shrink-0"
      >
        Upload
      </button>
    </div>
  );
}
