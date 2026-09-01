import type { Position } from "@/lib/schema";

const POSITION_RE =
  /(long|short)\s+([A-Z=.\-^]+)\s+([\d.]+)(?:\s+stop\s+([\d.]+))?(?:\s+target\s+([\d.]+))?/gi;

/** Free-text positions box: `long USO 2 stop 8 target 15, short XLE 1`. */
export function parsePositions(s: string): Position[] {
  const out: Position[] = [];
  for (const m of s.matchAll(POSITION_RE)) {
    const size = Number(m[3]);
    if (!Number.isFinite(size) || size <= 0) continue;
    out.push({
      ticker: m[2].toUpperCase(),
      side: m[1].toLowerCase() as Position["side"],
      size,
      stopPct: m[4] === undefined ? null : Number(m[4]),
      targetPct: m[5] === undefined ? null : Number(m[5]),
    });
  }
  return out;
}

export function formatPositions(positions: Position[]): string {
  return positions
    .map((p) => {
      const parts = [p.side, p.ticker, String(p.size)];
      if (p.stopPct !== null) parts.push("stop", String(p.stopPct));
      if (p.targetPct !== null) parts.push("target", String(p.targetPct));
      return parts.join(" ");
    })
    .join(", ");
}
