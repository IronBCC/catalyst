"use client";

import { useState, useSyncExternalStore } from "react";

const KEY = "catalyst.session";

/** Short, readable, and stable across reloads so it can be quoted in a bug report. */
function readOrCreate(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const created = Array.from({ length: 6 }, () =>
      "abcdefghjkmnpqrstuvwxyz23456789".charAt(Math.floor(Math.random() * 31)),
    ).join("");
    localStorage.setItem(KEY, created);
    return created;
  } catch {
    return "no-store";
  }
}

const subscribe = () => () => {};

export default function SessionId() {
  const [copied, setCopied] = useState(false);

  // localStorage does not exist while the page is rendered on the server, and an
  // id invented there would not match the browser's. useSyncExternalStore reads
  // the client value after hydration without a setState-in-effect cascade.
  const id = useSyncExternalStore(subscribe, readOrCreate, () => null);

  if (!id) return null;

  return (
    <button
      type="button"
      data-testid="session-id"
      title="Session id. Quote this when reporting a problem. Click to copy."
      aria-label={`Session ${id}, click to copy`}
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => setCopied(false),
        );
      }}
      className="num rounded-md px-2 py-1 text-[11px] text-faint hover:bg-panel-2 hover:text-muted"
    >
      {copied ? "copied" : id}
    </button>
  );
}
