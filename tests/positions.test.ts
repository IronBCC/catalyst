import { describe, expect, it } from "vitest";
import { formatPositions, parsePositions } from "@/lib/positions";

describe("parsePositions", () => {
  it("parses sizes, stops and targets", () => {
    const p = parsePositions("long USO 2 stop 8 target 15, short XLE 1");
    expect(p).toEqual([
      { ticker: "USO", side: "long", size: 2, stopPct: 8, targetPct: 15 },
      { ticker: "XLE", side: "short", size: 1, stopPct: null, targetPct: null },
    ]);
  });

  it("accepts tickers with punctuation and mixed case verbs", () => {
    const p = parsePositions("LONG BZ=F 1.5\nShort ^VIX 0.5 target 20");
    expect(p.map((x) => x.ticker)).toEqual(["BZ=F", "^VIX"]);
    expect(p[0].size).toBe(1.5);
    expect(p[1].targetPct).toBe(20);
  });

  it("ignores prose that is not a position", () => {
    expect(parsePositions("I think oil goes up")).toEqual([]);
  });

  it("round-trips through formatPositions", () => {
    const s = "long USO 2 stop 8 target 15, short XLE 1";
    expect(parsePositions(formatPositions(parsePositions(s)))).toEqual(parsePositions(s));
  });
});
