/**
 * The selector contract between the specs and the containers.
 *
 * Specs are written before the containers exist, so the names live here and
 * both sides import them. Anything a spec needs to click or read carries one of
 * these as `data-testid`.
 */
export const T = {
  // shell
  rail: "rail",
  railToggle: "rail-toggle",
  banner: "banner",
  tab: (name: "map" | "scenarios" | "thesis") => `tab-${name}`,
  panel: (name: "map" | "scenarios" | "thesis") => `panel-${name}`,
  disclaimer: "disclaimer",
  worldSwitcher: "world-switcher",
  worldOption: (id: string) => `world-option-${id}`,

  // rail
  railPane: (name: "hypothesis" | "branch") => `rail-pane-${name}`,
  hypothesisInput: "hypothesis-input",
  positionsInput: "positions-input",
  generateButton: "generate",
  regenerateButton: "regenerate",
  generating: "generating",
  exampleChip: (slug: string) => `example-${slug}`,
  logEntry: "log-entry",
  logSummary: "log-summary",
  logError: "log-error",
  branchInput: "branch-input",
  branchButton: "branch",

  // canvas
  canvas: "canvas",
  node: (id: string) => `node-${id}`,
  nodeProbability: "node-probability",
  nodeDelta: "node-delta",
  nodeNewPill: "node-new",
  nodeMarketPill: "node-market",
  edge: (id: string) => `edge-${id}`,

  // inspector
  inspector: "inspector",
  paramSlider: "param-slider",
  applyToWorld: "apply-to-world",
  applyHere: "apply-here",
  adoptMarket: "adopt-market",
  marketSays: "market-says",
  auditBlock: "audit-block",

  // scenarios
  worldsTable: "worlds-table",
  worldRow: (id: string) => `world-row-${id}`,
  worldProbability: "world-probability",
  histogram: "histogram",
  tornado: "tornado",
  removedEdges: "removed-edges",
  stressButton: "stress",
  stressCandidate: "stress-candidate",
  injectCandidate: "inject-candidate",

  // verdict
  verdict: "verdict",
  verdictLabel: "verdict-label",
  weakestLink: "weakest-link",

  // thesis
  thesisCard: "thesis-card",
  thesisEntry: "thesis-entry",
  thesisStop: "thesis-stop",
  thesisTakeProfit: "thesis-take-profit",
  thesisQuantileNote: "thesis-quantile-note",
  writeNarrative: "write-narrative",
  thesisNarrative: "thesis-narrative",
  copyMarkdown: "copy-markdown",

  // footer
  exportButton: "export",
  importInput: "import",
  clearButton: "clear",
} as const;

/** `data-testid` attribute helper: `<div {...tid(T.canvas)} />`. */
export const tid = (id: string) => ({ "data-testid": id });

/** Playwright selector for a testid. */
export const sel = (id: string) => `[data-testid="${id}"]`;
