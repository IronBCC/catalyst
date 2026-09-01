import type { GenerateInput } from "@/lib/schema";

/** The four chips on an empty canvas. Each one is a real assignment prompt. */
export const EXAMPLES: { slug: string; label: string; input: GenerateInput }[] = [
  {
    slug: "hormuz",
    label: "Hormuz",
    input: {
      hypothesis: "The Strait of Hormuz closes to commercial tanker traffic",
      mode: "explore",
      target: null,
      horizonDays: 30,
      positions: [{ ticker: "USO", side: "long", size: 1, stopPct: 8, targetPct: 25 }],
    },
  },
  {
    slug: "midterms",
    label: "Midterms",
    input: {
      hypothesis: "Democrats take the House in the 2026 midterms",
      mode: "explore",
      target: null,
      horizonDays: 90,
      positions: [],
    },
  },
  {
    slug: "export-controls",
    label: "Export controls",
    input: {
      hypothesis: "The US extends semiconductor export controls to legacy nodes",
      mode: "explore",
      target: null,
      horizonDays: 180,
      positions: [{ ticker: "SMH", side: "short", size: 1, stopPct: 10, targetPct: 20 }],
    },
  },
  {
    slug: "photonics",
    label: "Photonics",
    input: {
      hypothesis: "Photonic interconnects get adopted in datacenters faster than expected",
      mode: "explore",
      target: null,
      horizonDays: 365,
      positions: [],
    },
  },
];

export const EXAMPLE_BY_SLUG = new Map(EXAMPLES.map((e) => [e.slug, e]));
