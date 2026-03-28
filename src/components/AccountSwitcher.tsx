"use client";

import { useState, useEffect } from "react";
import { Account } from "@/lib/types";

export function AccountSwitcher({
  selected,
  onSelect,
}: {
  selected: Account | null;
  onSelect: (account: Account) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setAccounts(list);
        if (!selected && list.length > 0) {
          const defaultAccount = list.find((a: Account) => a.is_default) || list[0];
          onSelect(defaultAccount);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (accounts.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-400">Account:</span>
      <select
        value={selected?.id || ""}
        onChange={(e) => {
          const account = accounts.find((a) => a.id === e.target.value);
          if (account) onSelect(account);
        }}
        className="px-3 py-1.5 border border-zinc-200 rounded-md text-sm bg-white"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
      {selected?.color_palette && (selected.color_palette as string[]).length > 0 && (
        <div className="flex gap-0.5">
          {(selected.color_palette as string[]).slice(0, 4).map((color, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full border border-zinc-200"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
