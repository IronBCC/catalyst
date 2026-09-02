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
  onSelect(id: string): void;
}

const fmtPercent = (value: number): string => `${Math.round(value * 100)}%`;
const fmtMove = (value: number): string => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

export function WorldsTable(props: WorldsTableProps): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">Worlds</caption>
        <thead>
          <tr className="text-left text-muted">
            <th className="px-3 py-2 font-normal">World</th>
            <th className="num px-3 py-2 text-right font-normal">Root</th>
            <th className="num px-3 py-2 text-right font-normal">Target</th>
            {props.numericIds.map((numeric) => (
              <th key={numeric.id} className="num max-w-[9rem] truncate px-3 py-2 text-right font-normal" title={numeric.name}>
                {numeric.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const rowId = row.world.id;
            const name = String(row.world.name ?? row.world.id);
            const isActive = rowId === props.activeId;

            return (
              <tr
                key={rowId}
                data-testid={`world-row-${rowId}`}
                className={`border-t border-line ${isActive ? "bg-accent-soft/40" : "hover:bg-panel-2"}`}
              >
                <td className="px-3 py-2 align-middle">
                  <button
                    type="button"
                    role="button"
                    tabIndex={0}
                    aria-label={`Select world ${name}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => props.onSelect(rowId)}
                    className="flex items-center gap-2 text-left text-fg hover:text-accent"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 rounded-full ${isActive ? "bg-accent" : "bg-line-strong"}`}
                    />
                    <span className={isActive ? "font-medium" : ""}>{name}</span>
                    {isActive ? <span className="text-[11px] text-muted">active</span> : null}
                  </button>
                </td>
                <td data-testid="world-probability" className="num px-3 py-2 text-right align-middle text-fg">
                  {fmtPercent(row.rootP)}
                </td>
                <td className="num px-3 py-2 text-right align-middle">
                  {row.targetP === null ? <span className="text-faint">–</span> : <span className="text-fg">{fmtPercent(row.targetP)}</span>}
                </td>
                {props.numericIds.map((numeric) => {
                  const move = row.moves[numeric.id];
                  const moveValue = typeof move === "number" ? move : 0;
                  return (
                    <td
                      key={numeric.id}
                      className={`num px-3 py-2 text-right align-middle ${moveValue >= 0 ? "text-green" : "text-red"}`}
                    >
                      {typeof move === "number" ? fmtMove(moveValue) : "–"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default WorldsTable;
