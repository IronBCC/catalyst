"use client";

import * as React from "react";

interface RowWorld {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface WorldsTableProps {
  rows: {
    world: RowWorld;
    rootP: number;
    targetP: number | null;
    moves: Record<string, number>;
  }[];
  numericIds: { id: string; name: string }[];
  activeId: string;
  compareId: string;
  onSelect(id: string): void;
  onCompare(id: string): void;
}

const fmtPercent = (value: number): string => {
  const pct = Math.round(value * 100);
  return `${pct}%`;
};

const fmtMove = (value: number): string => {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
};

export function WorldsTable(props: WorldsTableProps): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded border border-line bg-panel p-3 text-fg">
      <table className="w-full border-collapse text-sm">
        <caption className="mb-2 text-left text-sm font-semibold text-muted">
          Worlds
        </caption>
        <thead>
          <tr className="text-left text-muted">
            <th className="pb-2 pr-3">World</th>
            <th className="pb-2 pr-3">Root P</th>
            <th className="pb-2 pr-3">Target P</th>
            {props.numericIds.map((numeric) => (
              <th key={numeric.id} className="pb-2 pr-3">
                {numeric.name}
              </th>
            ))}
            <th className="pb-2 pr-3">Compare</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const rowId = row.world.id;
            const name = String(row.world.name ?? row.world.id);
            const isActive = rowId === props.activeId;
            const isCompare = rowId === props.compareId;

            return (
              <tr
                key={rowId}
                className={`border-t border-line ${
                  isActive ? "border-l-4 border-l-gold bg-bg" : ""
                }`}
              >
                <td className="py-2 pr-3 align-top">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      role="button"
                      tabIndex={0}
                      className={`rounded border border-line px-2 py-1 ${
                        isActive
                          ? "border-gold bg-panel text-gold"
                          : "bg-bg hover:bg-line"
                      }`}
                      aria-label={`Select world ${name}`}
                      onClick={() => props.onSelect(rowId)}
                    >
                      Select
                    </button>
                    <span className={isActive ? "text-gold" : "text-fg"}>
                      {name}
                    </span>
                    {isActive ? (
                      <span className="rounded border border-gold px-1 text-xs text-gold">
                        active
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="pr-3 align-top text-muted">{fmtPercent(row.rootP)}</td>
                <td className="pr-3 align-top">
                  {row.targetP === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="text-fg">{fmtPercent(row.targetP)}</span>
                  )}
                </td>
                {props.numericIds.map((numeric) => {
                  const move = row.moves[numeric.id];
                  const moveValue = typeof move === "number" ? move : 0;
                  const isPositive = moveValue >= 0;

                  return (
                    <td
                      key={numeric.id}
                      className={`pr-3 align-top ${
                        isPositive ? "text-green" : "text-red"
                      }`}
                    >
                      {typeof move === "number" ? fmtMove(moveValue) : "—"}
                    </td>
                  );
                })}
                <td className="align-top">
                  <input
                    type="radio"
                    role="radio"
                    tabIndex={0}
                    aria-label={`Compare ${name}`}
                    className="h-4 w-4 border border-line bg-bg"
                    name="compare-world"
                    checked={isCompare}
                    onChange={() => props.onCompare(rowId)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default WorldsTable;
