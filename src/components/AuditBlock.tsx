'use client';

import React from "react";
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
}

function formatValue(value: number): string {
  const sign = Math.sign(value) > 0 ? "+" : "";
  if (Math.abs(value) >= 1) {
    return `${sign}${value.toFixed(3)}`;
  }

  return `${sign}${(value * 100).toFixed(2)}%`;
}

export function AuditBlock({ terms, final, fixed }: AuditBlockProps): ReactElement {
  return (
    <section data-testid="audit-block" className="w-full rounded-md border border-line bg-bg p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Audit
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[1fr_1.8fr_auto] gap-2 border-b border-line py-1 text-xs text-muted">
          <span className="font-semibold">Label</span>
          <span className="font-semibold">Formula</span>
          <span className="font-semibold text-right">Value</span>
        </div>
        {terms.map((term) => (
          <div
            className="grid grid-cols-[1fr_1.8fr_auto] gap-2 border-b border-line py-1 text-xs text-fg"
            key={`${term.label}-${term.formula}-${term.value}`}
          >
            <span>{term.label}</span>
            <span className="text-muted">{term.formula}</span>
            <span className="text-right font-mono">{formatValue(term.value)}</span>
          </div>
        ))}
      </div>
      {fixed && (
        <div className="mt-2 rounded border border-line bg-panel px-2 py-1 text-xs text-gold">
          intervention: parents ignored
        </div>
      )}
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 border border-line bg-panel p-2 text-xs">
        <span className="font-semibold text-muted">final</span>
        <span className="text-right font-mono text-fg">{final}</span>
      </div>
    </section>
  );
}
