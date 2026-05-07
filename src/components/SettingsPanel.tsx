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

export function SettingsPanel() {
  const [allMembers, setAllMembers] = useState<MemberData[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  // Per-account state
  const [accountContexts, setAccountContexts] = useState<Record<string, ContextData[]>>({});
  const [accountMembers, setAccountMembers] = useState<Record<string, MemberData[]>>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setAllMembers(data.members || []));
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setAccounts(list);
        // Single-account setup: load context + members for every account up front.
        list.forEach((a: Account) => {
          loadAccountContext(a.id);
          loadAccountMembers(a.id);
        });
      });
  }, []);

  const loadAccountContext = async (accountId: string) => {
    const res = await fetch(`/api/settings?account_id=${accountId}`);
    const data = await res.json();
    setAccountContexts((prev) => ({ ...prev, [accountId]: data.context || [] }));
  };

  const loadAccountMembers = async (accountId: string) => {
    const res = await fetch(`/api/accounts/${accountId}/members`);
    const data = await res.json();
    setAccountMembers((prev) => ({ ...prev, [accountId]: Array.isArray(data) ? data : [] }));
  };

  const assignMember = async (accountId: string, memberId: string) => {
    await fetch(`/api/accounts/${accountId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", member_id: memberId }),
    });
    loadAccountMembers(accountId);
  };

  const unassignMember = async (accountId: string, memberId: string) => {
    await fetch(`/api/accounts/${accountId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId }),
    });
    loadAccountMembers(accountId);
  };

  const createMemberForAccount = async (accountId: string, name: string, language: string) => {
    const res = await fetch(`/api/accounts/${accountId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name, language }),
    });
    const data = await res.json();
    if (!data.error) {
      setAllMembers((prev) => [...prev, data]);
      loadAccountMembers(accountId);
    }
    return data;
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

  const CONTEXT_KEYS = [
    { key: "company_description", label: "Description" },
    { key: "services", label: "Services" },
    { key: "target_audience", label: "Target Audience" },
    { key: "tone", label: "Tone Guidelines" },
    { key: "notable_clients", label: "Notable Clients" },
  ];

  return (
    <div className="space-y-8">
      {/* Brand context + assigned tones */}
      {accounts.map((account) => {
        const ctx = accountContexts[account.id] || [];
        return (
          <div key={account.id} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Brand context</h2>
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
                        placeholder={`${ck.label}...`}
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

            <div>
              <h2 className="text-lg font-semibold mb-4">Assigned tones</h2>
              <div className="space-y-2 mb-3">
                {(accountMembers[account.id] || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-zinc-50 rounded-md px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="text-xs text-zinc-400">{m.language === "en" ? "EN" : "ES"}</span>
                      {m.tone_description && <span className="text-xs text-zinc-300 truncate max-w-[200px]">{m.tone_description}</span>}
                    </div>
                    <button onClick={() => unassignMember(account.id, m.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
                {(accountMembers[account.id] || []).length === 0 && (
                  <p className="text-xs text-zinc-400">No members assigned yet.</p>
                )}
              </div>

              {(() => {
                const assignedIds = new Set((accountMembers[account.id] || []).map((m) => m.id));
                const unassigned = allMembers.filter((m) => !assignedIds.has(m.id));
                if (unassigned.length === 0) return null;
                return (
                  <div className="flex items-center gap-2 mb-3">
                    <select id={`assign-${account.id}`} className="px-2 py-1 border border-zinc-200 rounded text-xs bg-white flex-1">
                      {unassigned.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById(`assign-${account.id}`) as HTMLSelectElement;
                        if (select?.value) assignMember(account.id, select.value);
                      }}
                      className="px-3 py-1 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700"
                    >
                      Assign
                    </button>
                  </div>
                );
              })()}

              <NewMemberForm onSubmit={(name, lang) => createMemberForAccount(account.id, name, lang)} />
            </div>
          </div>
        );
      })}

      {/* All Team Members (edit tone/samples) */}
      <div>
        <h2 className="text-lg font-semibold mb-4">All Team Members</h2>
        <p className="text-xs text-zinc-400 mb-4">Create, edit, or delete members. Assign them to accounts above.</p>

        {/* Create new member globally */}
        <div className="border border-dashed border-zinc-300 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium mb-2">Create new member</h3>
          <NewMemberForm onSubmit={async (name, lang) => {
            setSaving(true);
            const res = await fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "create_member", name, language: lang }),
            });
            const data = await res.json();
            if (!data.error) setAllMembers((prev) => [...prev, data]);
            setSaving(false);
          }} />
        </div>

        <div className="space-y-4">
          {allMembers.map((member, i) => (
            <div key={member.id} className="border border-zinc-200 rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{member.name}</span>
                  <select value={member.language} onChange={(e) => { const updated = [...allMembers]; updated[i] = { ...member, language: e.target.value }; setAllMembers(updated); }} className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${member.name}? This will remove them from all accounts.`)) return;
                    await fetch("/api/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "delete_member", id: member.id }),
                    });
                    setAllMembers((prev) => prev.filter((m) => m.id !== member.id));
                  }}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Tone description</label>
                  <textarea value={member.tone_description || ""} onChange={(e) => { const updated = [...allMembers]; updated[i] = { ...member, tone_description: e.target.value }; setAllMembers(updated); }} rows={2} placeholder="e.g. Direct, data-driven..." className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Writing samples</label>
                  <textarea value={member.writing_samples || ""} onChange={(e) => { const updated = [...allMembers]; updated[i] = { ...member, writing_samples: e.target.value }; setAllMembers(updated); }} rows={4} placeholder="Paste example posts..." className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm resize-none" />
                </div>
                <button onClick={() => saveMember(allMembers[i])} disabled={saving} className="px-4 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50">Save</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewMemberForm({ onSubmit }: { onSubmit: (name: string, language: string) => void }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es");

  return (
    <div className="flex items-end gap-2">
      <input type="text" placeholder="New member name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-md text-xs" />
      <select value={language} onChange={(e) => setLanguage(e.target.value)} className="px-2 py-1.5 border border-zinc-200 rounded text-xs bg-white">
        <option value="es">ES</option>
        <option value="en">EN</option>
      </select>
      <button
        onClick={() => { if (name.trim()) { onSubmit(name.trim(), language); setName(""); } }}
        disabled={!name.trim()}
        className="px-3 py-1.5 bg-zinc-900 text-white text-xs rounded-md hover:bg-zinc-700 disabled:opacity-50 shrink-0"
      >
        Create & Assign
      </button>
    </div>
  );
}
