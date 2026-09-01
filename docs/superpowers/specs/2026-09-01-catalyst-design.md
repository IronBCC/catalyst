# Catalyst Causal-Chain Explorer — Design Spec

Date: 2026-09-01. Status: approved section by section during brainstorming.

## 1. Context

Take-home for "Catalyst". Users want to (1) test whether Event A plausibly leads to Event B and audit why, (2) enumerate tradeable downstream events of A, (3) see how black swans hit their positions, (4) know which events trigger stop-loss or take-profit, (5) leave with a thesis they can trade.

Inspiration: Metaculus question cards (crisp resolvable statements, probability, resolution criteria) and the FutureSearch research terminal (two panes; `overview | results | researchers | table` tabs; headline number with a p10..p90 strip; `rationale:` prose with inline source pills; "weighed against N public forecasts").

Verified live during design (2026-09-01):
- Polymarket `https://gamma-api.polymarket.com/public-search?q=` works without a key and returns events with nested markets and `outcomePrices` (e.g. "Strait of Hormuz traffic returns to normal by December 31?" at 27.5%).
- Yahoo `https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>` works without a key (unofficial) and returns `meta.regularMarketPrice`.
- Kalshi public API works but has no text search endpoint; skipped in v1.
- Metaculus API requires an auth token; skipped.
- OpenRouter supports `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`, streaming with structured outputs, and `provider.require_parameters: true` to restrict routing to endpoints that honor the schema.

Decisions taken with the user: hosted demo on Vercel plus repo; OpenRouter with a cheap model; both prediction-market odds and live prices as grounding; deterministic causal DAG (approach A) plus Monte-Carlo sampling from the same parameters, both in v1; FutureSearch-leaning UI; sliders with live propagation and an explicit Apply step.

## 2. UX

Three columns, dark theme, monospace (JetBrains Mono). Gold for hypothesis and question titles, green for values, red for adverse deltas, gray prose. Inline pills instead of source counts: `analog: 2019 Abqaiq`, `Polymarket 27.5%`, `USO $140.60`.

### Left rail (chat-style log)
- Input `What if…`. Segmented control `hypothesis | branch`, default `branch` once a graph exists. Mode select `explore | chain`; chain shows a target-outcome textbox. Horizon select (14 / 30 / 90 / 365 days). Optional positions input, e.g. `long USO 1 stop 8 target 15; short XLE 1`.
- Four example chips load fixtures instantly with no LLM call.
- Generation streams status lines (`mapping causes… 12 nodes`, `matching prediction markets… 3 hits`, `pricing 4 instruments`), then a summary: headline, main uncertainty, three follow-up chips (`Branch: …`, `Stress test`, `Thesis on USO`).
- Later inputs are branch requests (LLM adds an event and a new world is created) or new hypotheses. Every world created appears as a rail entry; clicking switches the active world. The rail is the multiverse log.
- Footer: Export JSON and Import JSON.

### Center tabs `map | scenarios | thesis | table`
- `map`: React Flow canvas, left-to-right, streams in during generation. Event node is a Metaculus-style card: question wording ("Brent settles below $70 by Oct 1?"), probability pill, Δ vs baseline badge (`+18pp` / `−9pp`), lock icon when pinned, lag (`+3–7d`), market pill when market odds adopted. Numeric node: name, level or move %, mini p10–p90 strip. Edge thickness = |parameter|, color promote vs inhibit (numeric edges by sign), hover shows the mechanism.
- `scenarios`: instrument or P&L selector; Monte-Carlo histogram; P(loss), P(stop hit), P(target hit); top-3 scenario clusters; sensitivity tornado; worlds table (rows = worlds, columns = key outcomes and instrument moves).
- `thesis`: thesis card (below) plus a `model vs market` edge column like FutureSearch `fs` vs `mkt`. Copy as Markdown.
- `table`: flat sortable list of all nodes: probability, market odds, Δ, instruments.

### Right inspector (selected node or edge)
- Node: statement, resolution criteria, timing. Slider: probability for event nodes; value in units for numeric nodes (`Brent $55–$110`). Dragging recomputes downstream live (Δ badges and strips update). Buttons `Apply to world`, `Apply as new world`, `Reset`. `Force TRUE`, `Force FALSE`, `Unpin`. "Why this number" audit block with the formula and live values. `Market says 27.5%` with `Adopt` when a match exists. Rationale prose, analogs as pills. `Branch here` textbox.
- Edge: mechanism, parameter slider with Apply/Reset, `Cut edge`.

### Chain verdict (mode chain)
Pinned at the top of the center pane: `P(B | A)` vs `P(B | ¬A)`, label, weakest link highlighted on the best path.

### Thesis card
Thesis line; instrument and direction; conviction; expected move and horizon; entry (live quote); stop and take-profit levels (from adverse and favorable quantiles); invalidation checklist (nodes whose TRUE kills the thesis); confirmation signals; black-swan risks; what the market already prices (Polymarket vs model); Monte-Carlo summary (P(profit), EV, p5). Numbers are deterministic and computed client-side; the LLM writes the narrative on demand.

## 3. Data model

```ts
type EventNode = { id; kind: "event"; statement; resolution; base: number /* 0..1 */; lagDays: [number, number]; rationale; analogs: string[]; marketQuery: string; isRoot: boolean; isTarget: boolean };
type NumericNode = { id; kind: "numeric"; name; unit; ticker: string | null; current: number | null; baselineMove: number /* % */; sigma: number /* % */; rationale };
type Node = EventNode | NumericNode;
type EdgeBase = { id: string /* `${source}->${target}` */; source; target; mechanism: string };
type Edge = EdgeBase & (
  | { kind: "ee"; polarity: "promote" | "inhibit"; strength: number /* 0..1 */ }
  | { kind: "en"; impact: number /* % move in target if event true */ }
  | { kind: "nn"; beta: number /* % per 1 % */ }
  | { kind: "ne"; threshold: number; direction: "above" | "below"; width: number; strength: number });
type Summary = { headline: string; mainUncertainty: string; followUps: string[] };
type Graph = { id; hypothesis; mode: "explore" | "chain"; target: string | null; horizonDays: number; nodes: Node[]; edges: Edge[]; model: string; generatedAt: string; summary: Summary | null };
type Edit =
  | { type: "pin"; nodeId; value: boolean }
  | { type: "override"; nodeId; value: number }   // event: p in 0..1; numeric: move %
  | { type: "cutEdge"; edgeId }
  | { type: "setEdgeParam"; edgeId; param: "strength" | "impact" | "beta"; value: number }
  | { type: "addNode"; node: Node; edges: Edge[] }
  | { type: "adoptMarket"; nodeId; value: number; source: string /* url */ };
type World = { id; name; parentId: string | null; edits: Edit[]; createdAt: string };
type Position = { ticker; side: "long" | "short"; size: number; stopPct: number | null; targetPct: number | null };
```

The graph is a DAG. Cycles coming from the LLM are broken at validation by removing the minimum-weight edge in each cycle (weight = strength, |impact|, or |beta|).

## 4. Math

### Expectation propagation (instant; drives sliders and Δ badges)
Topological order. For event i with promoting causes C+ and inhibiting causes C−, the cause value q_j is p_j for an event parent, and for a numeric parent (edge `ne`) `q = sigmoid(sign · (x − threshold) / width)` with sign +1 for `above`, −1 for `below`, where x is the level `current · (1 + m/100)` when `current` is known, else the move m.

```
p_or = 1 − (1 − base) · Π_{C+} (1 − s_j · q_j)
p_i  = p_or · Π_{C−} (1 − s_j · q_j)
```
Pinned nodes are 0 or 1; overridden nodes take the slider value. Both ignore parents.

Numeric k: `m_k = baselineMove + Σ_{en} p_j · impact_j + Σ_{nn} beta_l · m_l`; overridden → slider value. `level = current · (1 + m_k / 100)` when `current` is known.

Each node records audit terms `{ label, formula, value }`; the UI renders them as, for example, `base 20% · (1 − 0.85 × 0.70) · … ; × (1 − 0.30 × 0.50) = 62%`.

Semantics: pins and overrides are interventions (do-operator). Effects flow downstream only; there is no upstream inference. The UI says so.

### Monte-Carlo (N = 5000 default, seeded)
Per sample, in topological order: an event is Bernoulli with p computed from the sampled parent states (q_j ∈ {0, 1}; an `ne` cause fires with probability sigmoid(...) of the sampled level). A numeric node is `m = baselineMove + Σ impact_j · [j] + Σ beta_l · m_l + ε` with ε = sigma · t4 / √2 (Student-t, ν = 4, scaled to standard deviation sigma; fat tails). Pinned and overridden nodes are fixed with no noise.

Outputs: event P(true); numeric quantiles p10 / p25 / p50 / p75 / p90, mean and raw samples; position P&L% = Σ side · size · m_ticker / Σ size, with P(loss), P(P&L < −stop), P(P&L > target); scenario clusters = the top three most frequent joint states of the key nodes (root, target, and the three highest-|Δ| events) with their shares. Re-run debounced 150 ms while a slider drags.

### Sensitivity
For a target T (event p, numeric m, or P&L) and each event j: `Δ_j = T | do(j = 1) − T | do(j = 0)`. For a numeric j: `T | do(m = +σ) − T | do(m = −σ)`. Tornado sorted by |Δ|. "What hits my stop" lists events whose do(j = 1) pushes P&L below −stop.

### Chain verdict (mode chain)
`lift = P(B | do(A = 1)) − P(B | do(A = 0))`. Best path = maximum product of strengths (Dijkstra on −log s; `en` / `nn` edges weighted by min(1, |impact| / 100) and min(1, |beta|)). Weakest link = minimum-weight edge on that path. Labels: lift ≥ 0.30 strong, ≥ 0.10 plausible, > 0 weak, else none. Path count via DAG dynamic programming.

### Worlds
World state = base graph + `applyEdits` → `{ graph', pins, overrides }`. A slider drag is a transient edit appended last. Apply commits to the active world; Apply-as-new-world forks `{ parentId: active, edits: [...active.edits, edit] }`. Baseline has no edits.

## 5. LLM layer

Provider: OpenRouter through `@openrouter/ai-sdk-provider` and AI SDK 7. Env `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `openai/gpt-5.6-luna`, $0.20 / $1.20 per M tokens). Settings `reasoning.effort: "low"`, `provider.require_parameters: true`. One model for all calls. Documented alternatives: `google/gemini-3.1-flash-lite`, `deepseek/deepseek-v4-flash`.

Routes (Next.js route handlers; the key never reaches the browser):
1. `POST /api/generate` streamed. Input: hypothesis, mode, target, horizonDays, positions. Output object `{ nodes, edges, summary }` in that order so the canvas grows first; the summary comes last.
2. `POST /api/branch` small, non-streamed. Input: compact graph, world edits, user text. Output `{ node, edges }` with at most six edges to and from existing ids, including impacts on existing numeric nodes.
3. `POST /api/stress`. Output three to five black swans `{ node, edges }`, each with base ≤ 5% and high impact. Injecting one adds the node in a new world, pinned TRUE.
4. `POST /api/thesis`. Input: computed world summary (probabilities, Monte-Carlo quantiles, verdict, market odds, quotes, positions). Output `{ thesis, rationale, invalidation[], confirmation[], risks[], marketView }`. The LLM writes prose around numbers computed by the engine and never changes them.
5. `GET /api/markets?q=` Polymarket proxy, 60 s cache.
6. `GET /api/quote?symbols=` Yahoo proxy, 60 s cache.

LLM-facing edge schema is flat with all parameters nullable: `{ source, target, mechanism, polarity | null, strength | null, impact | null, beta | null, threshold | null, direction | null, width | null }`. `repairGraph` types each edge from its endpoint kinds and fills defaults (strength 0.5; width = 10% of |threshold| or 1). No `.optional()` in LLM-facing schemas; strict JSON schema requires all keys.

Prompt rules: crisp, dated, resolvable statements within the horizon; base rates from named reference classes; honest conditional strengths (not 0.9 everywhere); at least one inhibitor and one counter-force path; magnitudes calibrated to named analogs with numbers (e.g. "2019 Abqaiq: Brent +15% intraday, faded in two weeks"); lags in days; 8–16 nodes in explore mode; the target node flagged in chain mode; two to four numeric nodes with Yahoo-resolvable tickers (USO, BNO, XLE, TLT, SPY, GLD, CL=F …); short `marketQuery` per event; rationale ≤ 60 words; root first, then causal order.

Validation: zod clamps → `repairGraph` → one non-streamed retry with the validation errors fed back → rail error with Retry.

Fixtures: `public/fixtures/*.json` for the four example inputs, each holding the graph plus a Polymarket-match and quote snapshot, generated by `scripts/fixtures.ts`. Example chips never call the LLM. Development-only disk cache `.cache/llm/<sha256>.json` keyed on prompt and model, skipped on Vercel.

Cost and latency: generation ≈ 2k input + 5k output tokens ≈ $0.007, 15–40 s streamed. Branch, stress and thesis ≈ $0.002 each.

Stretch (not v1): OpenRouter web plugin (`plugins: [{ id: "web" }]`) for source pills like FutureSearch, behind `OPENROUTER_WEB=1`.

## 6. Grounding

- Markets: `/api/markets?q=` → `https://gamma-api.polymarket.com/public-search?q=<q>&limit_per_type=5` → flatten events → markets → `{ title, url: https://polymarket.com/event/<slug>, yes: Number(outcomePrices[0]), volume, endDate }`, keeping open Yes/No markets sorted by volume. Best match by token Jaccard against the node statement; the user confirms; Adopt records an `adoptMarket` edit and the thesis shows model-vs-market edge.
- Prices: `/api/quote?symbols=` → Yahoo v8 chart with a browser User-Agent → `{ symbol, price: meta.regularMarketPrice, changePct: meta.regularMarketChangePercent, currency, time }`; fills `current` on numeric nodes so moves become levels.
- Both cached 60 s in a module-level map. Failures return `{ data: null, error }`; the UI degrades to "% only" or "no market found" and the graph is never blocked.

## 7. Persistence, errors, limits

- localStorage via zustand `persist` (graph, worlds, positions); JSON export and import. No server storage, no share links in v1.
- Missing API key: `/api/generate` returns 503 and the UI shows `live generation off, examples work`.
- Math guards: clamp to [0, 1], NaN guards, |override| ≤ 300%.
- Known limits for the README: independence approximation in expectation mode; parameters are LLM estimates; no web research pass; Yahoo endpoint is unofficial; Kalshi and Metaculus skipped. Future work: Kalshi local index, web-plugin sources, share links, portfolio import.
