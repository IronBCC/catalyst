"use client";

import type { ReactElement } from "react";

type AuditTerm = {
  label: string;
  formula: string;
  value: number;
};

interface AuditBlockProps {
  terms: AuditTerm[];
  final: string;
  fixed: "pin" | "override" | null;
  /** Node id to display name, so a term reads as a sentence rather than two ids. */
  names?: Record<string, string>;
}

function formatValue(value: number): string {
  const sign = Math.sign(value) > 0 ? "+" : "";
  if (Math.abs(value) >= 1) {
    return `${sign}${value.toFixed(3)}`;
  }

  return `${sign}${(value * 100).toFixed(2)}%`;
}

export function AuditBlock({ terms, final, fixed, names = {} }: AuditBlockProps): ReactElement {
  const pretty = (label: string) =>
    label
      .split(/->|→/)
      .map((part) => names[part.trim()] ?? part.trim())
      .join(" → ");
  return (
    <section data-testid="audit-block" className="text-xs">
      <div className="overflow-hidden rounded-lg border border-line">
        {terms.map((term, i) => (
          <div
            className={`grid grid-cols-[1fr_auto] gap-x-3 px-3 py-1.5 ${i > 0 ? "border-t border-line" : ""}`}
            key={`${term.label}-${term.formula}-${i}`}
          >
            <span className="min-w-0 break-words text-fg">{pretty(term.label)}</span>
            <span className="num text-right text-fg">{formatValue(term.value)}</span>
            <span className="num col-span-2 text-[11px] text-muted">{term.formula}</span>
          </div>
        ))}
        {fixed && (
          <div className="border-t border-line bg-accent-soft/50 px-3 py-1.5 text-accent">
            Intervention: parents ignored.
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-line bg-panel-2 px-3 py-1.5">
          <span className="text-muted">final</span>
          <span className="num text-[15px] text-fg">{final}</span>
        </div>
      </div>
    </section>
  );
}
