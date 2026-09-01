# Catalyst Causal-Chain Explorer — Merged Implementation Plan (Claude + Codex)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task names its **Worker**; Codex tasks are dispatched with the brief template in Appendix A.

**Goal:** Web tool that turns a hypothesized event into an auditable causal graph of downstream events and market variables, lets the user explore a multiverse (pin, slide, branch, stress-test, compare) with live recomputation and Monte-Carlo, and ends in a tradeable thesis card.

**Architecture:** One Next.js 16 app on Vercel. The browser does all math (noisy-OR propagation, Monte-Carlo, sensitivity, hand topological layout). The server is three hardened LLM route handlers (OpenRouter via AI SDK 7, structured JSON, injectable fetch) plus two cached proxies (Polymarket search, Yahoo quotes). No database; versioned localStorage plus JSON export.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript, Tailwind 4, @xyflow/react 12.11, zustand 5, zod 4.5, ai 7.0 + @ai-sdk/react + @openrouter/ai-sdk-provider 3.0, vitest 4, @playwright/test 1.62. Node 22. No dagre, no UI kit, no Markdown library.

**Spec:** `docs/superpowers/specs/2026-09-01-catalyst-merged-design.md` (sections cited as §N).

## Global Constraints
- Provider: OpenRouter only. Env `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` default `openai/gpt-5.6-luna`. Settings `reasoning.effort: "low"`, `provider.require_parameters: true`, `temperature: 0.2`. One model for all calls. `fetch` injectable.
- The LLM never sets a number shown in the thesis; it parameterizes the graph once and writes prose. All displayed probabilities and moves come from `src/lib/engine`.
- Interventions are do-operator: downstream only. UI copy says "intervention".
- Deterministic engine: same graph + edits + seed → identical output. Monte-Carlo seeded.
- LLM-facing zod schemas: `z.strictObject`, no `.optional()`, use `.nullable()`.
- Baseline world (`id: "baseline"`) is immutable; any edit while it is active forks.
- Failed generate / branch / thesis calls never touch existing graph, worlds or thesis.
- HTTP: POST routes require `application/json` (415), body ≤ 1 MB (413), invalid body 400, no key 503, upstream failure or timeout (60 s) 502. CSP, nosniff, no-referrer headers from `next.config.ts` (§5).
- Any rendered external URL passes `safeHref` (http/https only) and uses `rel="noopener noreferrer"`.
- Accessibility: color never the only signal; inhibit edges dashed; Δ badges carry sign text; keyboard selection; persistent `Model estimates, not investment advice` label.
- Dark monospace aesthetic (JetBrains Mono). Load `frontend-design` before styling, `dataviz` before any chart.
- Staging, committing, merging, pushing and deploying each require explicit user authorization. At execution start ask once whether per-task commits are pre-authorized for this run. Commit steps below are conditional on that answer.
- Main worktree `/Users/ironbcc/orca/workspaces/trading_prediction/master-2`, branch `master-2`. Never bare `git stash`.
- **No two writers on overlapping files, ever.** Ownership is exclusive per phase (see Roster and File map). Only the Lead touches `package.json`, `next.config.ts`, `src/app/**`, `src/lib/schema.ts`, `store.ts`.
- Middle devs write leaf components only. A leaf declares its own props `interface` in its own file and imports nothing from `src/lib`. Containers sanitize URLs with `safeHref` before passing them down.
- No worker installs dependencies, runs `git`, or edits another worker's files. Every worker report is a claim; the Lead re-runs the oracle before merging.

## Build log — 2026-09-01, complete

`npm run check` green: 103 unit tests pass, 1 skipped (the paid live test), production
build clean, 11 Playwright specs pass. `npx tsc --noEmit` and `npx eslint .` both clean.

Verified against the running app rather than inferred: CSP / nosniff / no-referrer
headers present on `/`; `POST /api/generate` without a key returns 503; `/api/markets`
returns live Polymarket rows; `/api/quote?symbols=BZ=F` returned a real Yahoo price;
`/fixtures/hormuz.json` serves.

**Not verified: the live OpenRouter path.** No API key exists on this machine, so
`npm run test:live` has never run and no request has ever reached OpenRouter. The
fixtures were produced by the offline path — hand-written seed graphs through the real
`repairGraph` — with live Polymarket and Yahoo data attached. Every other test mocks the
provider. This is stated in the README too.

### Deviations from the plan as written
- `create-next-app` has no `--no-import-alias` any more, so the default `@/*` alias
  stays and every module uses it. Scaffolding also had to happen in a temp directory and
  be copied in, because the CLI refuses a directory that already holds `docs/`.
- `vitest.config.mts`, not `.ts` (Vite warns about ESM in a file loaded as CJS), with a
  `resolve.alias` so tests can use `@/…` as well.
- `experimental_useObject` is a deprecated alias in `@ai-sdk/react` 4.0.92; the code uses
  `useObject`.
- `Verdict` and `VerdictSchema` live in `schema.ts`, not `engine/verdict.ts`, so
  `ThesisInput` can name them without the schema module importing the engine.
- `compactGraph` takes the engine's `Computed` maps instead of a flat probability map,
  and prints a move for numeric nodes rather than a probability they do not have.
- `ParamSlider`'s `applyNewOnly` is not used: "Apply to world" stays visible on Baseline
  and forks, because hiding it strands the user on a read-only world.
- The Monte-Carlo drag cache was dropped. React 19's lint forbids both the ref and the
  effect that would implement it, and sampling measures in single-digit milliseconds at
  these graph sizes. Marked with a `ponytail:` comment and an upgrade path (a worker).
- Two comparison defaults were added because the plan's own e2e expectations require
  them: with no compare world selected, a slider measures against the same world before
  the drag, and "new" means new relative to the world this one forked from.
- Playwright specs written by the middles needed lead fixes at the gate: they assumed a
  graph existed without generating one, used the raw persist payload instead of
  zustand's `{ state, version }` envelope, mocked `/api/markets` without matching its
  query string, and mocked branch responses in LLM shape rather than repaired shape.

### Real bugs the gate caught
- `useComputed` returned the raw graph instead of the applied one, so nodes added by a
  world never reached the canvas.
- React Flow fitted the view before measuring the cards, which rendered the graph
  outside its own container and under the rail.
- The failure banner could not distinguish a missing key from an upstream error; the
  fetch status is now captured and shown.

---

## Roster

| Role | Worker | Launch | Workspace |
|---|---|---|---|
| Lead engineer / architect | Claude (this session) | — | `master-2` |
| Senior engineer E | Codex Terra #1 | `codex -m gpt-5.6-terra` | worktree `catalyst-engine` |
| Senior engineer S | Codex Terra #2 | `codex -m gpt-5.6-terra` | worktree `catalyst-server` |
| Middle dev 1–4 | Codex Spark ×4 | `codex -m gpt-5.3-codex-spark` | `master-2`, disjoint files |

Verified 2026-09-01 against `codex-cli 0.152.0`: the model picker offers `gpt-5.6-sol` (frontier), `gpt-5.6-terra` ("balanced agentic coding model for everyday work"), `gpt-5.6-luna` ("fast and affordable"), and `gpt-5.3-codex-spark` ("ultra-fast coding model"). Seniors run Terra, middles run Spark. `codex` has no `--agent` flag, so the model is passed with `-m`.

The Lead reviews every worker's output. There is no separate reviewer agent.

## Execution schedule

| Phase | Lead (Claude) | Senior E (Terra) | Senior S (Terra) | Middles 1–4 (Spark) | Gate — run by Lead |
|---|---|---|---|---|---|
| 0 | Task 0 scaffold, Task 1 schema | blocked | blocked | blocked | `npm run build` green, `npx vitest run tests/schema.test.ts` green. Land on `master-2` before anyone else starts. |
| 1 | `lib/layout.ts`, `lib/positions.ts`, `lib/examples.ts` (Task 11 part a), `playwright.config.ts`, `e2e/helpers.ts` | Tasks 2–7 engine, one brief | Tasks 8–9 server + proxies | M1 `EventNode`, `NumericNode`; M2 `CausalEdge`, `DistStrip`, `ParamSlider`; M3 `AuditBlock`, `Histogram`; M4 `Tornado`, `WorldsTable` | **Gate 1:** merge both worktrees (needs authorization), then `npx vitest run` + `npx tsc --noEmit` + `npm run build`, all from the Lead's own shell |
| 2 | Task 11 store + `useComputed`, Task 12 shell | Task 16 `lib/thesis.ts` + tests | Task 10 `scripts/fixtures.ts`, fixture JSON, `tests/fixtures.test.ts`, live test file (writes it, never runs it) | one Playwright spec each: M1 `generate`, M2 `worlds`, M3 `branch`, M4 `failures` (write only, never run) | **Gate 2:** store tests, `npx tsc --noEmit`, `npm run build` |
| 3 | Tasks 13, 14, 15, 17 containers wired to the leaf components; `e2e/{fixture,thesis,responsive}.spec.ts`; runs the whole Playwright suite; Task 18 README + `npm run check` | released | released | released | **Gate 3:** `npm run check` green, `npm run test:live` once with a real key |
| 4 (optional) | Task 19 web citations | — | — | — | live check with `OPENROUTER_WEB=1` |

Dependency facts that fix this order: leaf components depend only on the prop contracts written in Tasks 13–15 of this document, so they need nothing from Phase 1. Task 10 needs `repairGraph`, so it waits for Gate 1. Task 11's store needs the engine, so it waits for Gate 1; `layout.ts` / `positions.ts` / `examples.ts` do not, so they move to Phase 1. Playwright specs need only `e2e/helpers.ts`, written by the Lead in Phase 1.

## File map (`src/` unless noted)

| Path | Responsibility | Owner |
|---|---|---|
| `app/layout.tsx`, `app/globals.css` | font, theme tokens, Tailwind import, disclaimer footer | Lead |
| `app/page.tsx` | three-column shell, tabs, drawers, banner, verdict header | Lead |
| `app/api/{generate,branch,thesis,markets,quote}/route.ts` | one-line re-exports of `lib/api/*` handlers | Lead (Senior S supplies the handlers) |
| `next.config.ts` | security headers | Lead |
| `lib/schema.ts` | zod LLM schemas + internal schemas + types | Lead |
| `lib/engine/topo.ts` | `toposort`, `breakCycles` | Senior E |
| `lib/engine/propagate.ts` | `propagate`, `sigmoid`, `causeQ`, audit terms | Senior E |
| `lib/engine/worlds.ts` | `applyEdits`, `removeEditsFor`, `forkWorld`, `newWorld`, `BASELINE_ID`, `worldDiff` | Senior E |
| `lib/engine/mc.ts` | `monteCarlo`, `mulberry32`, `studentT4`, `quantiles` | Senior E |
| `lib/engine/sensitivity.ts`, `verdict.ts` | `tornado`, `stopTriggers`, `evalTarget`, `chainVerdict` | Senior E |
| `lib/engine/repair.ts` | `repairGraph`, `repairBranch`, `draftGraph`, `slugify` | Senior E |
| `lib/http.ts` | `readJson`, `HttpError`, `jsonError` | Senior S |
| `lib/llm.ts` | `Deps`, `llm`, `structured`, `hasKey` | Senior S |
| `lib/prompts.ts` | system prompts, `compactGraph`, prompt builders | Senior S |
| `lib/api/{generate,branch,thesis,markets,quote}.ts` | pure handlers `(req, deps) => Response` | Senior S |
| `lib/market.ts` | Polymarket + Yahoo parsing, search, cache | Senior S |
| `lib/safeUrl.ts` | `safeHref` | Senior S |
| `lib/layout.ts` | `layoutLR` hand topological layout | Lead |
| `lib/positions.ts` | `parsePositions` | Lead |
| `lib/examples.ts` | four example inputs | Lead |
| `lib/thesis.ts` | `buildThesis`, `toMarkdown` | Senior E |
| `lib/useGenerate.ts` | streaming hook with fallback | Lead |
| `store.ts` | `createCatalystStore`, `useStore`, `useComputed` | Lead |
| `components/Rail.tsx`, `Banner.tsx`, `Canvas.tsx`, `Inspector.tsx`, `MarketSays.tsx`, `Scenarios.tsx`, `Thesis.tsx`, `Verdict.tsx`, `StressPanel.tsx` | containers, wiring | Lead |
| `components/EventNode.tsx`, `NumericNode.tsx`, `CausalEdge.tsx`, `DistStrip.tsx`, `ParamSlider.tsx`, `AuditBlock.tsx`, `Histogram.tsx`, `Tornado.tsx`, `WorldsTable.tsx` | leaf components from prop contracts | Middles 1–4 |
| `public/fixtures/*.json`, `scripts/fixtures.ts` | example snapshots | Senior S |
| `tests/*.test.ts`, `tests/live/openrouter.live.test.ts` | vitest, colocated with its module | owner of that module |
| `playwright.config.ts`, `e2e/helpers.ts`, `e2e/{fixture,thesis,responsive}.spec.ts` | Playwright harness + Lead's specs | Lead |
| `e2e/{generate,worlds,branch,failures}.spec.ts` | one spec per middle dev, written against `e2e/helpers.ts` | Middles 1–4 |

---

### Task 0: Scaffold
**Worker:** Lead. Phase 0 — nobody else starts until this lands on `master-2`.
**Files:** create the Next app in the worktree root; `package.json`, `next.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `.env.example`, `README.md` (stub), `vitest.config.ts`.
- [x] `npx create-next-app@latest <dir> --ts --tailwind --eslint --app --src-dir --use-npm --disable-git --yes`, then rsync into the worktree root (create-next-app refuses a directory that already holds `docs/`). Done 2026-09-01: Next 16.3.4, React 19.2.8. **`--no-import-alias` no longer exists**, so the default alias `@/*` stays and every module imports `@/lib/...`.
- [x] `npm i @xyflow/react zustand zod ai @ai-sdk/react @openrouter/ai-sdk-provider`; `npm i -D vitest @playwright/test tsx`. Installed: `ai` 7.0.89, `@ai-sdk/react` 4.0.92, `@openrouter/ai-sdk-provider` 3.0.0 (peer `ai ^7`), `zod` 4.5.4, `@xyflow/react` 12.11.6, `zustand` 5.0.15, `vitest` 4.1.11, `@playwright/test` 1.62.1.
- [ ] `globals.css`: `@import "tailwindcss"; @theme { --font-mono: var(--font-jetbrains); --color-bg:#0b0e11; --color-panel:#12161b; --color-line:#1f262e; --color-fg:#c9d1d9; --color-muted:#7d8590; --color-gold:#e3b341; --color-green:#3fb950; --color-red:#f85149; --color-blue:#58a6ff; --color-orange:#d29922; }`. `layout.tsx` loads `JetBrains_Mono` from `next/font/google`, sets the class on `<body>`, renders `<footer>Model estimates, not investment advice</footer>`.
- [ ] `next.config.ts` `headers()` returning for `/(.*)`: `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- [ ] `.env.example`: `OPENROUTER_API_KEY=`, `OPENROUTER_MODEL=openai/gpt-5.6-luna`, `OPENROUTER_WEB=0`.
- [x] **`vitest.config.mts`** (the `.ts` extension makes Vite warn about ESM-in-CJS) with `resolve.alias { "@": ./src }` and `test: { include: ["tests/**/*.test.ts"] }` (the live test skips itself unless `RUN_LIVE_OPENROUTER=1`). Scripts: `"test": "vitest run"`, `"test:live": "RUN_LIVE_OPENROUTER=1 vitest run tests/live"`, `"test:e2e": "playwright test"`, `"check": "npm test && npm run build && npm run test:e2e"`.
- [x] `npm run build` passes; `curl -sI localhost:4318` returned the CSP, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` headers verbatim on 2026-09-01. Commit (if authorized) `chore: scaffold catalyst app`.

### Task 1: Schema (the contract)
**Worker:** Lead. Phase 0. This file is the contract every other worker codes against; it stays Lead-owned for the whole run.
**Files:** Create `src/lib/schema.ts`, `tests/schema.test.ts`.
**Produces:**
```ts
export const Confidence = z.enum(["low", "medium", "high"]);
export const Source = z.strictObject({ id: z.string(), title: z.string(), url: z.string(), publisher: z.string(), publishedAt: z.string().nullable() });
export const LlmEventNode = z.strictObject({ id: z.string(), kind: z.literal("event"), statement: z.string(), resolution: z.string(), base: z.number().min(0).max(1), lagDays: z.tuple([z.number().min(0), z.number().min(0)]), rationale: z.string(), analogs: z.array(z.string()), assumptions: z.array(z.string()), confidence: Confidence, marketQuery: z.string(), isRoot: z.boolean(), isTarget: z.boolean() });
export const LlmNumericNode = z.strictObject({ id, kind: z.literal("numeric"), name, unit, ticker: z.string().nullable(), current: z.number().nullable(), baselineMove: z.number().min(-100).max(100), sigma: z.number().min(0).max(200), rationale, assumptions: z.array(z.string()), confidence: Confidence });
export const LlmNode = z.discriminatedUnion("kind", [LlmEventNode, LlmNumericNode]);
export const LlmEdge = z.strictObject({ source, target, mechanism, assumptions: z.array(z.string()), confidence: Confidence, sourceIds: z.array(z.string()), polarity: z.enum(["promote","inhibit"]).nullable(), strength: z.number().min(0).max(1).nullable(), impact: z.number().min(-100).max(100).nullable(), beta: z.number().min(-10).max(10).nullable(), threshold: z.number().nullable(), direction: z.enum(["above","below"]).nullable(), width: z.number().min(0).nullable() });
export const Summary = z.strictObject({ headline: z.string(), mainUncertainty: z.string(), followUps: z.array(z.string()) });
export const LlmGraph = z.strictObject({ nodes: z.array(LlmNode), edges: z.array(LlmEdge), summary: Summary });
export const LlmBranchItem = z.strictObject({ node: LlmNode, edges: z.array(LlmEdge) });
export const LlmBranch = z.strictObject({ candidates: z.array(LlmBranchItem).min(1).max(5) });
export const LlmThesis = z.strictObject({ thesis: z.string(), rationale: z.string(), invalidation: z.array(z.string()), confirmation: z.array(z.string()), risks: z.array(z.string()), marketView: z.string() });
// internal (typed, not LLM-facing): Node, Edge (kinds ee/en/nn/ne per §3), Graph, Edit, World, Position, Workspace, plus zod `GraphSchema`, `WorkspaceSchema` for import validation
export type GenerateInput = { hypothesis: string; mode: "explore" | "chain"; target: string | null; horizonDays: number; positions: Position[] };
export const GenerateInputSchema = z.strictObject({ hypothesis: z.string().min(5).max(500), mode: z.enum(["explore","chain"]), target: z.string().max(500).nullable(), horizonDays: z.number().int().min(1).max(730), positions: z.array(PositionSchema).max(20) });
export type BranchInput = { graph: Graph; compact: string; text: string | null; attachTo: string | null; count: 1 | 3; blackSwan: boolean };
export const BranchInputSchema = z.strictObject({ graph: GraphSchema, compact: z.string().max(20000), text: z.string().max(500).nullable(), attachTo: z.string().nullable(), count: z.union([z.literal(1), z.literal(3)]), blackSwan: z.boolean() });
export type ThesisInput = /* shape defined in Task 16, type declared here */;
export const ThesisInputSchema: z.ZodType<ThesisInput>;
export const isEvent = (n: Node): n is EventNode => n.kind === "event";
export const isNumeric = (n: Node): n is NumericNode => n.kind === "numeric";
```
- [x] Tests: valid minimal `LlmGraph` parses; `strength: 1.5` fails; missing `assumptions` fails; unknown key fails; `z.toJSONSchema(LlmGraph)` has `additionalProperties: false` on every object and every property listed in `required` (walk the schema recursively); `GenerateInputSchema` rejects a 4-char hypothesis; `BranchInputSchema` rejects `count: 2`.
- [x] Done 2026-09-01: 10 tests pass, `npx tsc --noEmit` clean, `npx eslint .` clean. `Verdict` / `VerdictSchema` also live in `schema.ts` so that `ThesisInput` can name them without the schema importing the engine — **Senior E imports `Verdict` from `@/lib/schema` in Task 6 instead of declaring it**. Commit (if authorized) `feat(schema): zod schemas and core types`.

---

## Track E — engine (Senior E, Codex Terra, worktree `catalyst-engine`, Tasks 2–7 as one brief, Phase 1)

Brief: Appendix A with tasks 2–7, allowed files `src/lib/engine/**`, `tests/{topo,propagate,worlds,mc,sensitivity,verdict,repair}.test.ts`. Definition of done: `npx vitest run` green, `npx tsc --noEmit` clean, report includes the vitest summary line.

### Task 2: Topo + cycle break
**Files:** Create `src/lib/engine/topo.ts`, `tests/topo.test.ts`.
**Produces:** `toposort(ids: string[], edges: { source: string; target: string }[]): string[]` (throws `CycleError` listing one cycle); `breakCycles<E extends { id: string; source: string; target: string }>(ids: string[], edges: E[], weight: (e: E) => number): { edges: E[]; removed: E[] }`.
Algorithm: Kahn; if nodes remain, DFS among them to find one cycle (edge stack), remove the minimum-weight edge, repeat.
- [ ] Tests: chain a→b→c order; diamond keeps a first and d last; cycle a→b→a with weights 0.9 / 0.2 removes the 0.2 edge; two independent cycles both broken with `removed.length === 2`; `toposort` throws `CycleError` on a cycle.
- [ ] Run → FAIL. Implement. Run → PASS. Commit (if authorized) `feat(engine): toposort and cycle breaking`.

### Task 3: Propagation + audit
**Files:** Create `src/lib/engine/propagate.ts`, `tests/propagate.test.ts`.
**Consumes:** Task 1 types, Task 2 `toposort`.
**Produces:**
```ts
export type Fixed = { pins: Map<string, boolean>; overrides: Map<string, number> };
export type AuditTerm = { label: string; formula: string; value: number };
export type EventResult = { p: number; fixed: "pin" | "override" | null; terms: AuditTerm[] };
export type NumericResult = { move: number; level: number | null; fixed: "override" | null; terms: AuditTerm[] };
export type Computed = { order: string[]; events: Map<string, EventResult>; numerics: Map<string, NumericResult> };
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export function causeQ(edge: Edge, parent: EventResult | NumericResult, parentNode: Node): number;
export function propagate(graph: Graph, fixed: Fixed): Computed;
export const emptyFixed = (): Fixed => ({ pins: new Map(), overrides: new Map() });
```
Core:
```ts
let p = 1 - (1 - base) * promote.reduce((acc, e) => acc * (1 - e.strength * q(e)), 1);
p *= inhibit.reduce((acc, e) => acc * (1 - e.strength * q(e)), 1);
move = baselineMove + Σ en: p_source * impact + Σ nn: beta * move_source;
level = current == null ? null : current * (1 + move / 100);
```
- [ ] Tests (hand-computed): single promote edge base .2, s .7, parent p .85 → p = 1 − 0.8·(1 − 0.595) = 0.676; add inhibitor s .5 parent .3 → ×0.85 = 0.5746; pinned child ignores parents and `fixed === "pin"`; override sets the exact value; numeric chain event p .5 impact −10 → move −5; nn beta 0.6 → −3; level with current 100 → 97; `ne` threshold 70 below width 5, level 65 → q = sigmoid(1) = 0.731; terms count = 1 + number of parents; all p clamped to [0, 1] with NaN guard.
- [ ] Run → FAIL. Implement. Run → PASS. Commit (if authorized) `feat(engine): expectation propagation with audit terms`.

### Task 4: Worlds
**Files:** Create `src/lib/engine/worlds.ts`, `tests/worlds.test.ts`.
**Produces:**
```ts
export const BASELINE_ID = "baseline";
export function applyEdits(graph: Graph, edits: Edit[]): { graph: Graph; fixed: Fixed };
export function removeEditsFor(edits: Edit[], nodeId: string): Edit[]; // drops pin / override / adoptMarket for that node
export function forkWorld(parent: World, name: string, edit: Edit | Edit[]): World; // { id: crypto.randomUUID(), parentId: parent.id, edits: [...parent.edits, ...edits], createdAt }
export function newWorld(name: string, id?: string): World; // baseline = newWorld("Baseline", BASELINE_ID)
export function worldDiff(active: World, compare: World): { addedNodeIds: Set<string>; removedEdgeIds: Set<string> }; // addNode ids in active not in compare; cutEdge ids in active not in compare
```
Rules: pin / override / adoptMarket → fixed maps; for one node the LAST such edit wins and clears the other map; cutEdge removes; setEdgeParam clamps to schema bounds; addNode appends node + edges (drops edges with unknown endpoints) then `breakCycles`.
- [ ] Tests: pin then override → override wins, pins has no entry; `removeEditsFor` clears both; cutEdge removes; addNode adds node + edges, unknown-endpoint edge dropped; addNode cycle → weakest edge removed; fork copies parent edits + new edit and sets `parentId`; `worldDiff` reports one added node and one removed edge.
- [ ] Run → FAIL. Implement. Run → PASS. Commit (if authorized) `feat(engine): world edits`.

### Task 5: Monte-Carlo
**Files:** Create `src/lib/engine/mc.ts`, `tests/mc.test.ts`.
**Produces:**
```ts
export function mulberry32(seed: number): () => number;
export function studentT4(rng: () => number): number; // (Z / sqrt(V / 4)) / sqrt(2); V = sum of 4 squared normals; Z via Box-Muller
export type Quantiles = { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number };
export type McResult = { n: number; eventP: Map<string, number>; numeric: Map<string, { q: Quantiles; samples: Float64Array }>; pnl: { q: Quantiles; samples: Float64Array; pLoss: number; pStop: number | null; pTarget: number | null } | null; clusters: { states: Record<string, boolean>; share: number }[] };
export function monteCarlo(graph: Graph, fixed: Fixed, opts: { n?: number; seed?: number; positions: Position[]; keyNodeIds: string[] }): McResult;
export function quantiles(samples: Float64Array): Quantiles;
```
P&L% per sample = Σ (side === "long" ? 1 : −1) · size · move_ticker / Σ size; unknown tickers ignored.
- [ ] Tests: same seed → identical results; pinned event P exactly 0 / 1; tree graph event P within 0.02 of `propagate` p (n = 20000); sigma 0 no parents → all quantiles equal baselineMove; quantiles monotone; long position on move −5 sigma 0 → pLoss 1; cluster shares sum ≤ 1, sorted descending, ≤ 3.
- [ ] Run → FAIL. Implement. Run → PASS. Commit (if authorized) `feat(engine): monte-carlo sampler`.

### Task 6: Sensitivity + verdict
**Files:** Create `src/lib/engine/sensitivity.ts`, `src/lib/engine/verdict.ts`, `tests/sensitivity.test.ts`, `tests/verdict.test.ts`.
**Produces:**
```ts
export type Target = { type: "event"; id: string } | { type: "numeric"; id: string } | { type: "pnl" };
export type TornadoRow = { nodeId: string; low: number; high: number; delta: number };
export function evalTarget(graph: Graph, fixed: Fixed, target: Target, positions: Position[]): number;
export function tornado(graph: Graph, fixed: Fixed, target: Target, positions: Position[]): TornadoRow[]; // excludes pinned/overridden nodes and the target
export function stopTriggers(graph: Graph, fixed: Fixed, positions: Position[], stopPct: number): { nodeId: string; pnl: number }[];
import type { Verdict } from "@/lib/schema"; // already defined in Task 1, do not redeclare
export function chainVerdict(graph: Graph, fixed: Fixed, rootId: string, targetId: string): Verdict;
```
- [ ] Tests: tornado on a 3-node chain gives the root the largest |Δ|; inhibitor sign negative; pnl target works; verdict on chain strengths .9 / .4 → path has both edges, weakest = .4 edge, lift equals `propagate` difference; diamond pathCount 2; labels at 0.35 / 0.15 / 0.05 / 0.
- [ ] Run → FAIL. Implement. Run → PASS. Commit (if authorized) `feat(engine): sensitivity and chain verdict`.

### Task 7: Repair
**Files:** Create `src/lib/engine/repair.ts`, `tests/repair.test.ts`.
**Produces:** `slugify(s: string): string` (lowercase, `[^a-z0-9]+` → `-`, trim `-`, prefix `n-` if not starting with a letter, ≤ 64 chars); `repairGraph(llm: z.infer<typeof LlmGraph>, input: GenerateInput, model: string): Graph`; `repairBranch(item: z.infer<typeof LlmBranchItem>, graph: Graph): { node: Node; edges: Edge[] }`; `draftGraph(partial: unknown, input: GenerateInput): Graph | null` (streaming: keep nodes with `id` + `kind` + (`statement` | `name`), default missing numbers, keep edges whose endpoints exist and whose params type-check, run the same pipeline; null when no node).
Steps: slugify + dedupe ids (`-2` suffix); drop self-loops and unknown endpoints; type edges by endpoint kinds (`ee` polarity default promote, strength default 0.5; `en` needs impact else drop; `nn` needs beta else drop; `ne` needs threshold else drop, direction default above, width default max(1, 0.1 · |threshold|)); clamp to bounds; edge id `${source}->${target}`; `support = sourceIds.length ? "evidence" : "model_assumption"`; drop `sourceIds` not present in `graph.sources`; `breakCycles` by weight; exactly one `isRoot` (else first event, else synthesize from the hypothesis with base 0.5); chain mode: one `isTarget` (else best token-Jaccard match to `input.target`, else synthesize base 0.3 with one promote edge from root strength 0.3); `sources: []`; `generatedAt`, `id = crypto.randomUUID()`.
- [ ] Tests: one per rule; `support` becomes `model_assumption` when `sourceIds` dangle; a fixture-shaped realistic input passes unchanged except ids.
- [ ] Run → FAIL. Implement. Run → PASS. Commit (if authorized) `feat(engine): graph repair`.

**Gate 1 (engine half):** the Lead reviews branch `catalyst-engine` file by file against §4 of the spec, re-runs `npx vitest run && npx tsc --noEmit` in that worktree from the Lead's own shell (Senior E's report is a claim, not evidence), bounces findings back to Senior E in the same terminal, then asks the user to authorize merging `catalyst-engine` into `master-2`.

---

## Track S — server (Senior S, Codex Terra, worktree `catalyst-server`, Tasks 8–9 as one brief, Phase 1; Task 10 in Phase 2)

### Task 8: HTTP helpers, LLM client, prompts, handlers
**Worker:** Senior S. Before writing, check `ai` 7 and `@openrouter/ai-sdk-provider` 3 exports with context7 (`streamObject` vs `streamText` + `Output.object`; `toTextStreamResponse`; provider `fetch` and `extraBody` options) and report which export shape the installed versions actually have.
**Files:** Create `src/lib/http.ts`, `src/lib/llm.ts`, `src/lib/prompts.ts`, `src/lib/api/{generate,branch,thesis}.ts`, `src/app/api/{generate,branch,thesis}/route.ts`, `tests/http.test.ts`, `tests/prompts.test.ts`, `tests/api.test.ts`.
**Consumes:** schemas (Task 1); `repairBranch` (Task 7) server-side for branch. Senior E and Senior S run concurrently in separate worktrees, so Senior S imports `repairBranch` type-only and stubs it in `tests/stubs/repair.ts`; the Lead deletes the stub when both branches merge at Gate 1.
**Produces:**
```ts
// lib/http.ts
export class HttpError extends Error { constructor(public status: number, message: string) }
export async function readJson<T>(req: Request, schema: z.ZodType<T>, maxBytes = 1_048_576): Promise<T>; // 415 wrong content-type; 413 over cap (count bytes while streaming req.body); 400 parse or schema failure
export const jsonError = (status: number, error: string) => Response.json({ error }, { status });
// lib/llm.ts
export type Deps = { fetchImpl: typeof fetch; env: Record<string, string | undefined> };
export const defaultDeps = (): Deps => ({ fetchImpl: fetch, env: process.env });
export const modelId = (env: Deps["env"]) => env.OPENROUTER_MODEL ?? "openai/gpt-5.6-luna";
export const hasKey = (deps: Deps) => Boolean(deps.env.OPENROUTER_API_KEY);
export function llm(deps: Deps) { return createOpenRouter({ apiKey: deps.env.OPENROUTER_API_KEY, fetch: deps.fetchImpl }).chat(modelId(deps.env), { reasoning: { effort: "low" }, provider: { require_parameters: true } }); }
export async function structured<T>(deps: Deps, schema: z.ZodType<T>, system: string, prompt: string): Promise<T>; // generateText + Output.object, temperature 0.2, abortSignal: AbortSignal.timeout(60_000); throws HttpError(502) on timeout / invalid output after one retry that feeds back zod errors
// lib/prompts.ts
export const GENERATE_SYSTEM: string; export function generatePrompt(i: GenerateInput): string;
export function compactGraph(graph: Graph, computed: Computed): string; // "id | kind | statement | p=0.62" per node, "src->tgt | kind | param | mechanism" per edge
export const BRANCH_SYSTEM: string; export function branchPrompt(i: BranchInput): string; // blackSwan: "3 low-probability (base ≤ 0.05) high-impact events"; else 1 event from text, attach near attachTo
export const THESIS_SYSTEM: string; export function thesisPrompt(input: ThesisInput): string;
// lib/api/*.ts
export async function handleGenerate(req: Request, deps = defaultDeps()): Promise<Response>;
export async function handleBranch(req: Request, deps = defaultDeps()): Promise<Response>; // → { candidates: { node, edges }[] } after repairBranch
export async function handleThesis(req: Request, deps = defaultDeps()): Promise<Response>; // → LlmThesis
```
`handleGenerate`: 503 when `!hasKey`; `readJson(GenerateInputSchema)`; `streamObject({ model: llm(deps), schema: LlmGraph, system: GENERATE_SYSTEM, prompt, temperature: 0.2 })` → `result.toTextStreamResponse()`. `export const maxDuration = 60` in the route file. Route files: `export { handleGenerate as POST } from "@/lib/api/generate"` shape (one line each).
Test helper `tests/helpers/fakeFetch.ts`: `chatResponse(obj)` returns a `Response` with `{ choices: [{ message: { role: "assistant", content: JSON.stringify(obj) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }`; `fakeFetch(handler)` records calls.
- [ ] Tests `http.test.ts`: text/plain → 415; 1 MB + 1 byte body → 413; `{` → 400; schema violation → 400; valid → parsed.
- [ ] Tests `prompts.test.ts`: `compactGraph` one line per node and edge, p to 2 decimals; `generatePrompt` includes horizon, chain target line, positions; `branchPrompt` with `blackSwan` mentions `0.05`.
- [ ] Tests `api.test.ts` (branch handler, fake fetch): no key → 503; text/plain → 415; invalid body → 400; fake fetch throwing `AbortError` → 502; fake fetch returning `{ "candidates": "x" }` twice → 502; valid `{ candidates: [item] }` → 200 with repaired node and typed edges; generate with no key → 503.
- [ ] Run → FAIL. Implement. Run → PASS.
- [ ] Manual: `curl -N -X POST localhost:3000/api/generate -H 'content-type: application/json' -d '{"hypothesis":"The Strait of Hormuz is going to open next week","mode":"explore","target":null,"horizonDays":30,"positions":[]}'` streams JSON; parse the final object with `LlmGraph` in a node script. If streaming fails after one hour of verified effort, switch `handleGenerate` to `structured()` + `Response.json`, and `useGenerate` (Task 12) to a fetch with a status ticker. Record the decision in the README.
- [ ] Commit (if authorized) `feat(api): hardened openrouter structured routes`.

### Task 9: Market + quote libs and proxies
**Worker:** Senior S.
**Files:** Create `src/lib/market.ts`, `src/lib/safeUrl.ts`, `src/lib/api/{markets,quote}.ts`, `src/app/api/{markets,quote}/route.ts`, `tests/market.test.ts`, `tests/safeUrl.test.ts`.
**Produces:**
```ts
export type MarketMatch = { title: string; url: string; yes: number; volume: number; endDate: string | null; source: "polymarket" };
export type Quote = { symbol: string; price: number; changePct: number; currency: string; time: string };
export function tokens(s: string): string[]; export function scoreMatch(a: string, b: string): number; // Jaccard, lowercase alnum tokens minus stopwords, length ≥ 3
export function ttlCache<T>(ms: number): { get(k: string): T | undefined; set(k: string, v: T): void };
export function parsePolymarket(json: unknown): MarketMatch[]; // outcomePrices JSON-string; keep outcomes ["Yes","No"] && !closed; sort volume desc; top 5
export function parseYahoo(json: unknown, symbol: string): Quote | null;
export async function searchPolymarket(q: string, fetchImpl?: typeof fetch): Promise<MarketMatch[]>;
export async function fetchQuotes(symbols: string[], fetchImpl?: typeof fetch): Promise<Record<string, Quote | null>>; // UA "Mozilla/5.0", per-symbol try/catch
export function safeHref(s: string): string | null; // new URL(s); protocol http:|https: → href without hash; else null
export async function handleMarkets(req: Request, deps?): Promise<Response>; // GET ?q= → { data: MarketMatch[] | null, error: string | null }, q ≤ 200 chars else 400
export async function handleQuote(req: Request, deps?): Promise<Response>; // GET ?symbols=A,B (≤ 10) → { data: Record<string, Quote | null>, error }
```
- [ ] Tests: `scoreMatch("Strait of Hormuz reopens to tanker traffic by Oct 1?", "Strait of Hormuz traffic returns to normal by December 31?") > scoreMatch(same, "US Open ATP final")`; `parsePolymarket` with real shape (`outcomePrices: "[\"0.275\", \"0.725\"]"`) → yes 0.275; `parseYahoo` → price 140.6; `ttlCache` expires; `safeHref("javascript:alert(1)") === null`, `safeHref("https://a.b/c#x") === "https://a.b/c"`; `handleQuote` with 11 symbols → 400.
- [ ] Run → FAIL. Implement. Run → PASS. Manual curl of both routes. Commit (if authorized) `feat(api): polymarket and yahoo proxies`.

### Task 10: Fixtures + live test
**Worker:** Senior S writes `scripts/fixtures.ts`, the fixture JSON, `tests/fixtures.test.ts` and `tests/live/openrouter.live.test.ts` in Phase 2 (after Gate 1, because it needs `repairGraph`). Senior S never runs the live test. The Lead runs `npm run test:live` with the real key at Gate 3.
**Files:** Create `scripts/fixtures.ts`, `src/lib/examples.ts`, `public/fixtures/{hormuz,midterms,export-controls,photonics}.json`, `tests/fixtures.test.ts`, `tests/live/openrouter.live.test.ts`.
**Produces:** `EXAMPLES: { slug: string; label: string; input: GenerateInput }[]` (four assignment prompts; explore mode; horizons 30 / 90 / 180 / 365). Fixture shape `{ input: GenerateInput; llm: z.infer<typeof LlmGraph>; graph: Graph; markets: Record<string, MarketMatch[]>; quotes: Record<string, Quote | null> }` (`llm` kept so Playwright mocks can replay it through the real repair path).
- [ ] Script: per example → `structured(defaultDeps(), LlmGraph, GENERATE_SYSTEM, generatePrompt(input))` → `repairGraph` → `searchPolymarket(marketQuery)` per event (sequential, 300 ms gap) → `fetchQuotes(tickers)` → write JSON. Run `npx tsx scripts/fixtures.ts`. Regenerate any graph with < 8 nodes, < 2 numerics, no root, or absurd values.
- [ ] `tests/fixtures.test.ts`: each JSON loads, `GraphSchema` parses, `LlmGraph` parses `llm`, `propagate` p all in [0, 1], ≥ 8 nodes, ≥ 2 numerics, exactly one root.
- [ ] `tests/live/openrouter.live.test.ts`: `it.skipIf(!process.env.RUN_LIVE_OPENROUTER || !process.env.OPENROUTER_API_KEY)`; calls `structured` for the Hormuz input; asserts the same invariants as the fixture test. Not part of `npm run check`.
- [ ] Commit (if authorized) `feat: example fixtures and opt-in live test`.

**Gate 1 (server half):** the Lead reviews branch `catalyst-server` (`src/lib/{http,llm,prompts,market,safeUrl}.ts`, `src/lib/api/*`) against §5–6, re-runs `npm test` and `npx tsc --noEmit` personally, and authorizes the merge with the user. After both halves land, the Lead runs `npm run build` once on the merged `master-2`.

---

## Track U — UI (Lead wires containers; Middles 1–4 write leaf components in Phase 1 and one Playwright spec each in Phase 2)

### Task 11: Store + layout + positions
**Worker:** Lead. `lib/layout.ts`, `lib/positions.ts`, `lib/examples.ts` in Phase 1 (no engine dependency); `store.ts` and `useComputed` in Phase 2 after Gate 1.
**Files:** Create `src/store.ts`, `src/lib/layout.ts`, `src/lib/positions.ts`, `tests/store.test.ts`, `tests/layout.test.ts`, `tests/positions.test.ts`.
**Produces:**
```ts
// lib/layout.ts — hand topological layout, no dagre
export function layoutLR(nodes: { id: string; width: number; height: number }[], edges: { source: string; target: string }[]): Map<string, { x: number; y: number }>;
// rank = longest path from a source (toposort order, rank[t] = max(rank[t], rank[s] + 1)); x = rank · (maxWidth + 140); y = index within rank · (height + 40), ranks centered vertically
// lib/positions.ts
export function parsePositions(s: string): Position[]; // /(long|short)\s+([A-Z=.\-^]+)\s+([\d.]+)(?:\s+stop\s+([\d.]+))?(?:\s+target\s+([\d.]+))?/gi
export function formatPositions(p: Position[]): string;
// store.ts
export type Status = { phase: "idle" | "generating" | "branching" | "thesis" | "error"; message: string };
export type LogEntry = { id: string; kind: "user" | "status" | "summary" | "world" | "error"; text: string; worldId?: string; followUps?: string[]; retry?: () => void };
export type Selection = { type: "node" | "edge"; id: string } | null;
export type Workspace = { version: 1; graph: Graph | null; worlds: World[]; activeWorldId: string | null; compareWorldId: string | null; positions: Position[]; thesis: Record<string, z.infer<typeof LlmThesis>> };
export type State = Workspace & {
  selection: Selection; transient: Edit | null; status: Status; tab: "map" | "scenarios" | "thesis"; log: LogEntry[]; draft: Graph | null;
  markets: Record<string, MarketMatch[]>; quotes: Record<string, Quote | null>;
  setGraph(g: Graph, snapshot?: { markets: State["markets"]; quotes: State["quotes"] }): void; // replaces graph, worlds = [baseline], active = baseline, compare = null, thesis = {}
  setDraft(g: Graph | null): void;
  mutate(edit: Edit | Edit[], name?: string): void;            // baseline active → forkWorld + activate; else append
  removeEditsFor(nodeId: string): void;                        // baseline active → no-op
  setTransient(e: Edit | null): void;
  commitTransient(asNew: boolean, name?: string): void;        // fork when asNew || active is baseline
  addWorld(w: World, activate: boolean): void; setActiveWorld(id: string): void; setCompareWorld(id: string | null): void;
  select(s: Selection): void; setTab(t: State["tab"]): void; setPositions(p: Position[]): void;
  pushLog(e: Omit<LogEntry, "id">): void; setStatus(s: Status): void;
  setMarkets(nodeId: string, m: MarketMatch[]): void; setQuotes(q: Record<string, Quote | null>): void;
  setThesis(worldId: string, t: z.infer<typeof LlmThesis>): void;
  importWorkspace(p: Workspace): void; reset(): void;
};
export function createCatalystStore(storage: StateStorage | null): StoreApi<State>; // null → no persist (tests)
export const useStore: UseBoundStore<StoreApi<State>>; // createCatalystStore(safeStorage) with persist({ name: "catalyst.workspace", version: 1, migrate: (s, v) => v === 1 ? s : EMPTY, partialize })
export const safeStorage: StateStorage; // getItem: try { const v = localStorage.getItem(k); if (v == null) return null; JSON.parse(v); return v } catch { return null }
export function useComputed(): { graph: Graph | null; world: World | null; fixed: Fixed; computed: Computed | null; compare: Computed | null; mc: McResult | null; diff: ReturnType<typeof worldDiff> | null; verdict: Verdict | null };
// useMemo on [graph, world.edits, transient, positions, compareWorldId, quotes]; numeric current = quotes[ticker]?.price ?? node.current; mc debounced 150 ms during transient
```
- [ ] Tests `store.test.ts` (in-memory `StateStorage` fake): `setGraph` creates exactly one world with id `baseline`; `mutate` on baseline creates a new world with one edit and activates it, baseline still has `edits: []`; `mutate` on a non-baseline world appends; `commitTransient(false)` on baseline forks anyway; `commitTransient(true)` forks from a non-baseline world; `removeEditsFor` clears a pin; `setStatus({ phase: "error" })` leaves `graph`, `worlds`, `thesis` untouched; persisted JSON has `version: 1` and no `status` / `log` / `selection`; storage containing `{not json` → store hydrates to the empty workspace; `version: 0` payload → migrated to empty.
- [ ] Tests `layout.test.ts`: root x < child x; two nodes in the same rank have distinct y; diamond has three ranks. `positions.test.ts`: the example string parses to two positions with stop 8 / target 15 and nulls; `formatPositions` round-trips.
- [ ] Run → FAIL. Implement. Run → PASS. Commit (if authorized) `feat(ui): store, layout, positions`.

### Task 12: Shell + Rail + generation
**Worker:** Lead, Phase 2.
**Files:** Modify `src/app/page.tsx`; create `src/components/Rail.tsx`, `src/components/Banner.tsx`, `src/lib/useGenerate.ts`.
**Behavior:** `useGenerate()` wraps `useObject` from `@ai-sdk/react` (verified 2026-09-01 in 4.0.92: `useObject` is the current export and `experimental_useObject` is a deprecated alias of it) with `{ api: "/api/generate", schema: LlmGraph }`. On each partial: `pushLog` status `mapping causes… N nodes` when the count changes; `setDraft(draftGraph(partial, input))`. On finish: `repairGraph(final, input, "openrouter")` → `setGraph` → `pushLog` summary with `followUps`. On error: `pushLog({ kind: "error", retry })`, `setDraft(null)`, existing graph untouched. If Task 8 chose the non-streamed fallback, `useGenerate` POSTs and ticks status lines every 4 s (`mapping causes…`, `estimating strengths…`, `pricing instruments…`).
Rail: example chips (`fetch("/fixtures/<slug>.json")` → `setGraph(graph, { markets, quotes })`); segmented `hypothesis | branch`; mode select with target textbox when chain; textarea + submit (Enter); horizon select; positions input parsed by `parsePositions`. `New hypothesis` with an existing graph → `confirm()` first. Branch submit → `POST /api/branch` `{ graph, compact: compactGraph(graph, computed), text, attachTo: selection?.id ?? null, count: 1, blackSwan: false }` → for `candidates[0]` `mutate({ type: "addNode", node, edges }, text)` (forks from baseline automatically) → `pushLog` world. Failure → error entry with Retry, nothing else changes. Follow-up chips: `Branch: …` → branch submit; `Stress test` → Task 17 panel; `Thesis on X` → `setTab("thesis")`. Footer: `Export JSON` (download `Workspace`), `Import JSON` (`WorkspaceSchema.parse` → confirm → `importWorkspace`), `Clear workspace` (confirm → `reset()` + `localStorage.removeItem("catalyst.workspace")`). Banner when any route returns 503: `live generation off, examples work`.
Shell: header (title, tabs, drawer toggles below 1024 px), left rail, center, right inspector slot. Drawers: `@media (max-width: 1024px)` rail and inspector `position: fixed`, toggled by header buttons, `aria-expanded`.
- [ ] Manual: chip → graph in store; typed hypothesis → streaming counts; key removed → banner; branch 502 (`OPENROUTER_MODEL=nonexistent/model`) → error entry, node count unchanged.
- [ ] Commit (if authorized) `feat(ui): shell, rail, generation`.

### Task 13: Canvas + nodes + edges
**Worker:** Lead writes `Canvas.tsx` in Phase 3 and owns the prop contracts below. Middle 1 writes `EventNode.tsx` + `NumericNode.tsx`, Middle 2 writes `CausalEdge.tsx` + `DistStrip.tsx`, both in Phase 1 straight from these contracts (brief: Appendix A; oracle `npx tsc --noEmit` on the leaf files). Each leaf declares its own props `interface` locally and imports nothing from `src/lib`. Lead loads `frontend-design` and `dataviz` before wiring.
**Files:** Create `src/components/Canvas.tsx`, `EventNode.tsx`, `NumericNode.tsx`, `CausalEdge.tsx`, `DistStrip.tsx`.
**Contracts:**
```ts
export type EventNodeData = { node: EventNode; result: EventResult; compareP: number | null; pinned: boolean | null; adopted: boolean; isNew: boolean; onPath: boolean; selected: boolean };
export type NumericNodeData = { node: NumericNode; result: NumericResult; compareMove: number | null; strip: Quantiles | null; isNew: boolean; selected: boolean };
export type CausalEdgeData = { edge: Edge; weight: number /* 0..1 */; onPath: boolean; weakest: boolean; selected: boolean };
export function DistStrip(props: { q: Quantiles; unit: string; current: number | null; width?: number }): JSX.Element; // SVG, p10–p90 bar, p50 tick, labels at ends
```
Rules for the middle devs: `EventNode` 260 px card; gold title tint when `isRoot`, ring when `isTarget`; probability pill green when `p ≥ compareP` else red tint; Δ badge text `+18pp` / `−9pp` when |Δ| ≥ 1 pp (`compareP` null → no badge); lock icon when `pinned !== null`; lag `+3–7d`; market pill when `adopted`; `new` pill when `isNew`; confidence dot with `title`; `tabIndex={0}`, `role="button"`, `aria-label` = statement. `NumericNode`: name, `level unit` or `move %`, `DistStrip`. `CausalEdge`: `getBezierPath`; `strokeWidth = 1 + 4·weight`; promote / positive solid `--color-blue`; inhibit / negative `--color-orange` with `strokeDasharray="6 4"`; `onPath` gold; `weakest` red dashed; `EdgeLabelRenderer` mechanism when hovered, focused or selected; `tabIndex={0}`.
`Canvas` (Claude): builds nodes from `useComputed()` (draft during streaming), `position: layoutLR(...)`, weight = `strength | min(1, |impact| / 20) | min(1, |beta|)`; `ReactFlowProvider`; `fitView` when `ids.join()` changes; `onNodeClick` / `onEdgeClick` / Enter key → `select`; `nodesFocusable`, `edgesFocusable`.
- [ ] Manual: fixture renders left-to-right; streaming graph grows; hover and Tab+Enter both show the mechanism; inhibit edges dashed.
- [ ] Commit (if authorized) `feat(ui): causal canvas`.

### Task 14: Inspector, slider, audit, market adopt, branch here
**Worker:** Lead writes `Inspector.tsx`, `MarketSays.tsx` in Phase 3 and owns the contracts. Middle 2 writes `ParamSlider.tsx`, Middle 3 writes `AuditBlock.tsx`, both in Phase 1.
**Files:** Create `src/components/Inspector.tsx`, `ParamSlider.tsx`, `AuditBlock.tsx`, `MarketSays.tsx`.
**Contracts:**
```ts
export function ParamSlider(props: { label: string; min: number; max: number; step: number; value: number; format: (v: number) => string; onInput(v: number): void; onApply(): void; onApplyNew(): void; onReset(): void; disabled?: boolean; applyNewOnly?: boolean /* baseline active: hide "Apply to world" */ }): JSX.Element; // <input type="range"> with aria-valuetext = format(value)
export function AuditBlock(props: { terms: AuditTerm[]; final: string; fixed: "pin" | "override" | null }): JSX.Element; // rows label | formula | value; last line "= 62%"; note "intervention: parents ignored" when fixed
```
Inspector (Claude): node header (statement / name), resolution + lag, confidence pill, assumptions list, `ParamSlider` (event 0..100 step 1, value = `transient?.value ?? result.p`; numeric with `current` → level range `[current·0.5, current·1.5]` step `current/200` converted to move %; else move −50..50). `onInput` → `setTransient({ type: "override", ... })`; Apply → `commitTransient(false)`; Apply as new world → `prompt()` name defaulting to `"<node> = <value>"` → `commitTransient(true, name)`; Reset → `setTransient(null)`. Pin buttons → `mutate({ type: "pin", ... })`; Unpin → `removeEditsFor`. Baseline notice `Baseline is read-only; edits create a world`. `AuditBlock`. `MarketSays`: on select, if `markets[nodeId]` missing → `fetch("/api/markets?q=" + encodeURIComponent(marketQuery))` → `setMarkets`; best match by `scoreMatch(statement, title)` with yes %, volume, link via `safeHref` + `rel="noopener noreferrer"`; `Adopt` → `mutate({ type: "adoptMarket", value: yes, source: url })`; alternates in `<details>`. Rationale; analogs as pills. `Branch here` textarea → branch submit with `attachTo: nodeId`. Edge inspector: `Why this follows` (mechanism) first, then polarity, lag, strength, assumptions, support badge (`evidence` / `model assumption`), confidence, `ParamSlider` on strength / impact / beta → `mutate({ type: "setEdgeParam", ... })`, `Cut edge` → `mutate({ type: "cutEdge" })`.
- [ ] Manual: root slider drag moves downstream Δ badges live; Apply on Baseline creates a world (rail entry); Adopt sets p; edge cut removes it in the new world only.
- [ ] Commit (if authorized) `feat(ui): inspector with live sliders and market grounding`.

### Task 15: Scenarios tab
**Worker:** Lead writes `Scenarios.tsx` in Phase 3 and owns the contracts. Middle 3 writes `Histogram.tsx`, Middle 4 writes `Tornado.tsx` + `WorldsTable.tsx`, all in Phase 1. Lead loads `dataviz` before wiring.
**Files:** Create `src/components/Scenarios.tsx`, `Histogram.tsx`, `Tornado.tsx`, `WorldsTable.tsx`.
**Contracts:**
```ts
export function Histogram(props: { samples: Float64Array; q: Quantiles; unit: string; markers?: { label: string; value: number }[]; bins?: number /* 40 */ }): JSX.Element; // SVG; p10 / p50 / p90 lines labelled with text, not only color
export function Tornado(props: { rows: TornadoRow[]; labels: Record<string, string>; unit: string; max?: number /* 8 */ }): JSX.Element; // horizontal low→high bars; negative side hatched pattern + text values
export function WorldsTable(props: { rows: { world: World; rootP: number; targetP: number | null; moves: Record<string, number> }[]; numericIds: { id: string; name: string }[]; activeId: string; compareId: string; onSelect(id: string): void; onCompare(id: string): void }): JSX.Element; // active row highlighted + "active" text; compare radio per row
```
Scenarios (Claude): selector each numeric plus `P&L` when positions exist; `Histogram` with stats row (P(loss), P(stop), P(target) for P&L; p10 / p50 / p90 for numerics); clusters list top 3 (`Hormuz reopens ✓ · Iran struck ✗`); `Tornado` from `tornado()`; `stopTriggers` list `What hits my stop` when a stop exists; `WorldsTable` from all worlds (rows computed via `propagate(applyEdits(...))`); compare selector bound to `setCompareWorld`; `Removed vs compare` list from `diff.removedEdgeIds` with mechanisms.
- [ ] Manual: numbers match the inspector; switching world or compare updates badges and table.
- [ ] Commit (if authorized) `feat(ui): scenarios tab`.

### Task 16: Thesis
**Worker:** Senior E writes `src/lib/thesis.ts` + `tests/thesis.test.ts` in Phase 2 (brief: this task, allowed files those two, oracle vitest). Lead writes `Thesis.tsx` and `ThesisInputSchema` in `schema.ts`.
**Files:** Create `src/lib/thesis.ts`, `tests/thesis.test.ts`, `src/components/Thesis.tsx`; modify `src/lib/schema.ts` (ThesisInput).
**Produces:**
```ts
export type Leg = { ticker: string; name: string; direction: "long" | "short"; expectedMove: number; p10: number; p90: number; entry: number | null; stop: number | null; takeProfit: number | null };
export type ThesisInput = { hypothesis: string; horizonDays: number; worldName: string; primary: Leg | null; candidates: Leg[]; invalidation: { nodeId: string; statement: string; deltaPnl: number }[]; confirmation: { nodeId: string; statement: string; deltaPnl: number }[]; risks: { nodeId: string; statement: string; base: number }[]; marketView: { statement: string; model: number; market: number; edge: number; url: string }[]; mc: { pProfit: number; ev: number; p5: number } | null; verdict: Verdict | null };
export function buildThesis(graph: Graph, computed: Computed, mc: McResult, verdict: Verdict | null, positions: Position[], quotes: Record<string, Quote | null>, markets: Record<string, MarketMatch[]>, edits: Edit[], worldName: string): ThesisInput;
// candidates = numerics ranked by |p50| · (1 − share of [p10, p90] overlapping 0); direction = sign(p50); primary = positions[0] ticker if present else candidates[0]
// stop = entry · (1 + adverse quantile / 100) (p10 long, p90 short); takeProfit = entry · (1 + favorable quantile / 100); null when entry null
// invalidation = 5 most adverse tornado rows on primary; confirmation = 5 most favorable; risks = events with base ≤ 0.1 sorted by |Δ|; marketView from adoptMarket edits and matched markets
export function toMarkdown(input: ThesisInput, narrative: z.infer<typeof LlmThesis> | null): string; // ends with "Model estimates, not investment advice. Stops and targets are Monte-Carlo quantiles."
```
- [ ] Tests: ranking picks the largest confident move; long stop = entry · (1 + p10 / 100), take-profit = entry · (1 + p90 / 100); short flips; `entry: null` → stop and takeProfit null; markdown contains every section header and the disclaimer.
- [ ] Run → FAIL. Implement. Run → PASS.
- [ ] `Thesis.tsx` (Claude): renders the card from `buildThesis`, `model vs market` column, `Write narrative` → `POST /api/thesis` (body `ThesisInput`) → `setThesis(worldId, result)`; failure keeps the prior narrative and shows an error line; `Copy Markdown` → `navigator.clipboard.writeText(toMarkdown(...))`; disclaimer line under stops.
- [ ] Commit (if authorized) `feat(ui): thesis card and narrative`.

### Task 17: Verdict header + stress panel
**Worker:** Lead, Phase 3.
**Files:** Create `src/components/Verdict.tsx`, `src/components/StressPanel.tsx`; modify `src/app/page.tsx`, `src/components/Rail.tsx` (chip wiring).
**Behavior:** `Verdict`: when `graph.mode === "chain"` show `P(B|A)=62% vs P(B|¬A)=35% · lift +27pp · plausible · weakest: <mechanism> (0.4)`; click → `select` the weakest edge. `StressPanel`: `POST /api/branch` with `{ graph, compact, text: null, attachTo: null, count: 3, blackSwan: true }` → list candidates (statement, base %, top impacts); `Inject` → `mutate([{ type: "addNode", node, edges }, { type: "pin", nodeId: node.id, value: true }], "Black swan: <statement>")` → `setTab("scenarios")`. Failure → error line, nothing else changes.
- [ ] Manual: chain example shows the verdict and highlights the path; inject creates a world and shifts the P&L histogram.
- [ ] Commit (if authorized) `feat(ui): chain verdict and stress test`.

### Task 18: Playwright, README, full check
**Worker:** Lead, Phase 3. The Playwright specs `generate`, `worlds`, `branch`, `failures` come from Middles 1–4 in Phase 2; the Lead writes `fixture`, `thesis`, `responsive` and runs the whole suite.
**Files:** Lead creates `playwright.config.ts` and `e2e/helpers.ts` in Phase 1 (so the middles have the contract), `e2e/{fixture,thesis,responsive}.spec.ts` and `README.md` in Phase 3. Middles create `e2e/{generate,worlds,branch,failures}.spec.ts` in Phase 2 and never run them.
`playwright.config.ts`: Chromium, `webServer: { command: "npm run build && PORT=4173 npm start", port: 4173, reuseExistingServer: false }`, trace on first retry, screenshot on failure. `e2e/helpers.ts`: `mockApi(page, { generate?, branch?, thesis?, markets?, quote? })` using `page.route("**/api/<name>", …)`; default generate mock fulfils `text/plain` body `JSON.stringify(hormuz.llm)`; default branch mock returns one candidate built from `hormuz.llm.nodes` and one edge; markets mock returns one Polymarket match with `yes: 0.275`.
- [ ] Specs: `fixture`: click `Hormuz` chip → ≥ 8 nodes, disclaimer visible. `generate`: type hypothesis → mocked stream → nodes appear, summary in rail. `worlds`: select root, `ArrowRight` × 10 on the slider → a `+…pp` badge; `Apply to world` while Baseline → new rail entry, Baseline row in worlds table still shows original p; compare selector switches badges. `branch`: rail branch → new node with `new` pill; stress → 3 candidates → inject → world named `Black swan: …`; adopt market → pill `Polymarket 27.5%`. `thesis`: thesis tab shows entry / stop / take-profit and the quantile label; `Write narrative` (mocked) fills prose; Copy Markdown writes the clipboard (grant permission). `failures`: generate mock 503 → banner text; branch mock 502 → node count unchanged and error entry; reload → graph, worlds and thesis restored; corrupt `localStorage` value → app loads empty without console errors. `responsive`: viewport 900 px → rail hidden, header toggle opens it.
- [ ] README: what it is, screenshots, architecture, math (spec §4 condensed), grounding, security headers, limitations, future work, run (`cp .env.example .env.local`, `npm run dev`, `npm run check`, paid `npm run test:live`), deploy (`vercel env add OPENROUTER_API_KEY`). State plainly that live OpenRouter behavior is verified only by `npm run test:live`.
- [ ] `npm run check` green. Commit (if authorized) `docs: readme and e2e suite`.
- [ ] Ask the user before `vercel` deploy or `git push`.

**Gate 3:** the Lead reviews `src/components/**`, `src/store.ts`, `src/app/**` and the four middle-written specs, runs `npm run check` and one `npm run test:live` with a real key, and reports the exact summary lines.

### Task 19 (stretch, only after Gate 3): Web citations
**Worker:** Lead, Phase 4. Behind `OPENROUTER_WEB=1`.
**Files:** Create `src/lib/sources.ts`, `tests/sources.test.ts`; modify `src/lib/llm.ts`, `src/lib/api/generate.ts`, `src/components/Inspector.tsx`.
**Produces:** `normalizeUrl(s: string): string | null` (`safeHref` without hash, query kept); `verifySources(model: Source[], annotations: { url: string }[]): { sources: Source[]; dropped: string[] }` (keep only exact normalized matches); `applySources(graph: Graph, sources: Source[]): Graph` (drop dangling `sourceIds`, recompute `support`). `llm()` adds `extraBody: { tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", max_total_results: 6 } }], max_tool_calls: 2 }` when `env.OPENROUTER_WEB === "1"`; annotations read from the provider response metadata (verify the field with context7 at task start). Never reject on zero searches. Inspector renders sources as pills via `safeHref`.
- [ ] Tests: fragment stripped, query kept, `javascript:` dropped; unmatched source dropped and its edge downgraded to `model_assumption`; matched source kept.
- [ ] Manual with `OPENROUTER_WEB=1`: one generation shows ≥ 1 source pill. Commit (if authorized) `feat: optional web citations`.

## Verification (end-to-end)
1. `npm test` green (schema, engine, http, api handlers, market, safeUrl, store, layout, positions, thesis, fixtures).
2. `npm run build` clean; `curl -I` shows CSP, nosniff, no-referrer.
3. `npm run dev` → chips load with zero OpenRouter traffic.
4. Live: "Photonic chips get adopted faster than expected" → nodes within ~5 s (or ticker if fallback), graph < 45 s, summary in rail.
5. Root slider → Δ badges and strips update during drag; Apply on Baseline forks; Baseline row unchanged.
6. Branch "Iran is struck the next day" → new node with `new` pill, P&L histogram shifts left for long USO.
7. Chain mode: "Strait of Hormuz opens" → "Brent falls below $70 within a month" → verdict with weakest link dashed red.
8. Adopt Polymarket odds → p changes, thesis `marketView` shows the edge.
9. Kill the key → 503 banner; generate again → graph untouched.
10. `npm run test:e2e` green; `npm run check` green; deploy to a Vercel preview after user OK.

## Appendix A — Dispatching the crew (orca terminals)

All flags below were checked against `orca agent-context --json` on 2026-09-01. `orca terminal send` takes `--terminal` and `--text`; `orca terminal wait` takes `--for exit|tui-idle`; older shorthand forms do not exist.

### One-time, at the start of Phase 1

```bash
# two senior worktrees, branched off master-2 after Phase 0 has landed
orca worktree create --repo path:/Users/ironbcc/orca/workspaces/trading_prediction/master-2 \
  --name catalyst-engine --base-branch master-2 --json
orca worktree create --repo path:/Users/ironbcc/orca/workspaces/trading_prediction/master-2 \
  --name catalyst-server --base-branch master-2 --json

# seniors, one terminal each, in their own worktree
orca terminal create --worktree name:catalyst-engine --title "SENIOR-E" --command "codex -m gpt-5.6-terra" --json
orca terminal create --worktree name:catalyst-server --title "SENIOR-S" --command "codex -m gpt-5.6-terra" --json

# four middles, all in master-2, disjoint files
for n in 1 2 3 4; do
  orca terminal create --worktree path:/Users/ironbcc/orca/workspaces/trading_prediction/master-2 \
    --title "MIDDLE-$n" --command "codex -m gpt-5.3-codex-spark" --json
done
```

Record every returned handle (`term_…`). Losing a handle means losing the worker.

### Per brief

```bash
orca terminal send --terminal <handle> --text "<brief>" --enter
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 1800000
orca terminal read --terminal <handle> --cursor <cursor from the read before send> --limit 400 --json
```

Read once before sending to capture the cursor, then read with that cursor after the wait — that returns only the worker's answer.

### Brief body (fill every line; the worker gets no other context)

```
Repo root: <worktree path>. You are on branch <branch>. Read only these:
  docs/superpowers/specs/2026-09-01-catalyst-merged-design.md §<sections>
  docs/superpowers/plans/2026-09-01-catalyst-merged.md Tasks <N–M>
Allowed files (create or modify): <exact list>. Touching anything else fails the brief.
Forbidden: installing dependencies, editing package.json, running any git command, starting subagents.
Order: write the failing tests exactly as the task lists them, run `npx vitest run tests/<file>`, watch it fail, implement, run again.
Done when: `npx vitest run` is green and `npx tsc --noEmit` prints nothing.
Report exactly five lines: (1) the final vitest summary line verbatim, (2) the tsc result, (3) files created or modified, (4) any test you changed or skipped and why, (5) open questions.
```

For a middle writing a leaf component the oracle is `npx tsc --noEmit` alone, the allowed list is that component's file only, and the brief adds: `Declare the props interface inside this file. Import nothing from src/lib. Assume every URL handed to you is already sanitized.`

For a middle writing a Playwright spec the allowed list is that one `e2e/*.spec.ts`, the brief adds `Use only the helpers exported by e2e/helpers.ts; do not run playwright`, and the oracle is `npx tsc --noEmit`.

### Lead's standing rules for the crew

- Every report is a claim. Re-run the oracle in the Lead's own shell before merging or building on it.
- Bounce findings into the same terminal rather than opening a new one — a fresh worker re-reads context from cold.
- Never `pkill`. To retire a worker: `orca terminal close --terminal <handle> --tab --json`.
- Six workers write concurrently only where the file map says their sets are disjoint. When in doubt, serialize.

## Appendix B — Self-review against spec (done 2026-09-01)
- §2 UX: rail (T12), tabs map / scenarios / thesis (T13, T15, T16), inspector (T14), verdict (T17), drawers (T12), disclaimer (T0), a11y (T13–T15), failure rule (T11–T17), Baseline immutability (T11). Table tab deferred per spec.
- §3 data model: T1; `support` / `sourceIds` (T7); `Workspace` (T11).
- §4 math: T3, T5, T6; worlds + diff (T4, T11).
- §5 LLM: T8 (hardening, routes, fallback), stress via branch (T17), no dev cache, prompts (T8); stretch web (T19).
- §6 grounding: T9, T14; `safeHref` (T9).
- §7 persistence: T11 (version, migrate, corrupt), import/export/clear (T12).
- §8 testing: unit across tasks; Playwright + live (T10, T18).
- §9 hybrid: roster (Lead + 2 Terra seniors + 4 Spark middles), phase table, per-task worker tags, Appendix A dispatch commands, gates 1 / 2 / 3.
