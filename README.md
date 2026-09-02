# Catalyst

Catalyst turns a hypothesis about the world into an auditable causal graph, lets you
explore alternative versions of that graph side by side, and ends in a thesis card you
could actually trade against.

You type something like *"the Strait of Hormuz closes to commercial tanker traffic"*.
A model proposes the downstream events and the market variables they move, with a
mechanism and a set of assumptions on every link. From there the browser does the
arithmetic: probabilities propagate through the graph, a seeded Monte-Carlo samples
five thousand paths, and a sensitivity pass ranks what actually moves the outcome.

**Model estimates, not investment advice.**

## What it does

The three tabs follow the model: a **hypothesis** is the root question, **affected
areas** is the generated causal map it implies, and a **world** is a named set of
assumed changes to that map.

- **Causal map.** Events and numeric variables laid out left to right in causal order.
  Every edge carries the mechanism behind it, the assumptions it rests on, and whether
  it is backed by evidence or is a modelling assumption.
- **Interventions, not correlations.** Pinning a node or dragging its slider is a
  do-operator: it fixes that node and lets only its descendants move. Parents stay put.
- **Worlds.** Baseline is read-only. Any edit forks a new world, so the original model
  is always one click away and every world is one click from every other. Every
  what-if forks its own world from wherever you are, named after the question, so
  branching twice gives two worlds to switch between rather than one that quietly
  accumulates every assumption. A world is capped at 40 nodes.
- **Distributions.** Monte-Carlo with Student-t tails, seeded so the same graph always
  gives the same numbers. P&L, stops and take-profits come out of the quantiles rather
  than a fixed percentage.
- **Grounding.** Event nodes are matched against Polymarket questions and numeric nodes
  against Yahoo quotes, so you can see where the model disagrees with a live market and
  adopt the market's number if you prefer it.
- **Thesis card.** Primary leg, entry, stop, take-profit, what would invalidate it, what
  would confirm it, and the tail risks — with an optional written narrative that is
  forbidden from changing any number.

## Running it

```bash
cp .env.example .env.local     # add OPENROUTER_API_KEY for live generation
npm install
npm run dev                    # http://localhost:3000
```

### Model settings

| variable | default | what it is for |
|---|---|---|
| `OPENROUTER_MODEL` | `z-ai/glm-5.3-flash` | the model behind every call |
| `OPENROUTER_MAX_OUTPUT_TOKENS` | `32000` | a whole graph is a large payload; a verbose model needs more room |
| `OPENROUTER_REASONING` | `low` | an effort level, a number (reasoning token budget), or `off` |
| `OPENROUTER_PROVIDER_ORDER` | empty | comma-separated OpenRouter provider slugs, most preferred first |

The last two exist because structured output is where models and their endpoints
differ most, and the difference is rarely about the model being good or bad. See
"Choosing a model" below.

The four example chips work with **no key at all** — they load pre-built fixtures from
`public/fixtures/`. Without a key the generate, branch and thesis routes answer `503`
and the app says so in a banner instead of breaking.

## Checks

```bash
npm test          # unit: schema, engine, quality checks, http, handlers, store, thesis
npm run build     # production build, including the security headers
npm run test:e2e  # Playwright, every route mocked, no network
npm run check     # all three
npm run quality -- <model>   # live: eight quality checks, cost and latency, per model
```

One test is **not** in `npm run check` because it costs money and needs credentials:

```bash
OPENROUTER_API_KEY=... npm run test:live
```

It skips itself unless both `RUN_LIVE_OPENROUTER=1` and a key are set. It passes
against `poolside/laguna-s-2.1` (about 35 seconds for a full graph).

## Choosing a model

Structured output is a forced tool call, not `response_format: json_schema`. That
choice is not stylistic: of the three models measured here, one does not support
`response_format` at all, and asking for it produced prose that silently ignored the
schema.

`npm run quality -- <model>` runs six prompts (four explore, two chain) through the
eight checks in `src/lib/quality.ts`, repeats one prompt to measure run-to-run
stability, and records latency and the real dollar cost read off the wire.

Measured 2026-09-01, one run per prompt, all three on identical checks and schema:

| model | graphs | quality | median | $/graph | tickers resolve | chain sound |
|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` via Fireworks | 7/7 | 90% | 34 s | $0.0024 | 7/7 | 7/7 |
| `poolside/laguna-s-2.1` | 6/7 | 80% | 142 s | $0.0010 | 3/6 | 6/6 |
| `qwen/qwen3.8-flash` | 2/7 | 83% | 48 s | $0.0046 | 2/2 | 2/2 |

GLM is the default: it is the only one that produced every graph including both
chain prompts, the only one whose tickers all resolved against Yahoo, and it is
four times faster than poolside for a quarter of a cent per graph.

Poolside is cheapest and nothing else. Half its graphs carry tickers that do not
price (`688981`, `NASDAQ:AMZN`, `BRN1!`, `SPX`), and at 142 s a generation is slow
enough to be felt. Qwen never failed on quality — it failed to answer, returning
upstream rate limits on three separate runs (4/7, 4/7, 2/7).

All three scored 0/4 on the first attempt, each for a different reason, and none of
them was the model:

- **poolside** advertises no `response_format`; a json_schema request 404s when
  `provider.require_parameters` is set and is silently ignored without it. It needs
  the forced tool call, and `require_parameters` off, because that flag also refuses
  to route a named `tool_choice` for this model.
- **GLM** was routed to the Together endpoint, which answers a forced tool call with
  `{}` and zero completion tokens while still billing the prompt. Pinning
  `OPENROUTER_PROVIDER_ORDER=fireworks` turns 0/7 into 7/7. The pin sends
  `allow_fallbacks: false`, because a fallback lands right back on the broken route.
- **qwen** rejects a named `tool_choice` while thinking mode is on, so it needs
  `OPENROUTER_REASONING=off`.

Pinning also exposed a bug of our own: `z.tuple` serialises to the draft-7 list form
of `items`, which Fireworks rejects outright (`'items' must be a schema object, got
list`). `lagDays` is a fixed-length array now. It only ever worked because requests
were falling through to laxer endpoints.

### What the numbers do and do not support

Six prompts with one run each separates 7/7 from 2/7 and 34 s from 142 s. It does not
separate 90% from 83%: GLM's own `signs-match-mechanisms` moved 6/7 to 4/7 between two
runs of the same configuration, and its stability check failed once and passed once.

Two checks are keyword heuristics. `signs-match-mechanisms` and
`resolutions-checkable` catch blatant contradictions and vagueness, not subtle ones,
and unusual phrasing fools them. They are lint, not proof. And no check verifies that
a base rate is *correct* — only that the set of them has spread, tails and distinct
values. Verifying 0.03 against the world needs a source the app does not have.

Known gap worth fixing next: models emit tickers in the wrong dialect
(`NASDAQ:AMZN`, `SPX`, `BRN=F`, TradingView's `BRN1!`). `repairGraph` should normalise
the common forms and drop what cannot resolve, rather than keeping a symbol that
silently never prices.

## How the numbers work

Propagation is a noisy-OR over each event's parents. For an event with base rate `b`,
promoting parents `C⁺` and inhibiting parents `C⁻`:

```
p = 1 − (1 − b) · Π(1 − sⱼ·qⱼ)   for j in C⁺
p = p · Π(1 − sⱼ·qⱼ)             for j in C⁻
```

`q` is the parent's own probability for an event parent, and for a numeric parent it is
`sigmoid(±(x − threshold) / width)` — a soft threshold on the level. Numeric variables
move by `baselineMove + Σ p·impact + Σ β·move`, and a level follows from the current
price. Every term is kept and shown in the inspector's audit block, so any number on
screen can be traced back to its inputs.

Monte-Carlo samples events as Bernoulli draws in topological order and numeric noise
from a Student-t with four degrees of freedom, which gives the fat tails that a normal
would miss. Sensitivity pins each node low and high in turn and reports the swing.
Chain mode adds a verdict: the lift between intervening true and false, the strongest
path found by Dijkstra over `−log(strength)`, and the weakest link on that path.

## Architecture

One Next.js 16 app on Vercel. No database.

- `src/lib/schema.ts` — every type in the system, and the zod schemas the model must
  satisfy. LLM-facing schemas are strict objects with no optional fields; anything
  unusable is spelled `null`, because that is what a JSON Schema can express faithfully.
- `src/lib/engine/**` — pure, deterministic, no I/O: topological sort and cycle
  breaking, propagation, world edits, Monte-Carlo, sensitivity, chain verdict, and the
  repair pass that turns model output into a valid DAG.
- `src/lib/api/**` — the route handlers as plain `(Request, deps) => Response`
  functions, so every one of them is testable without a server.
- `src/store.ts` — one zustand store plus `useComputed`, the single memo that derives
  the entire view from the graph and the active world's edit list.
- `src/components/**` — containers wire the store; leaf components take plain props and
  import nothing from `src/lib`.

## Security

Responses carry a strict `Content-Security-Policy`, `X-Content-Type-Options: nosniff`
and `Referrer-Policy: no-referrer`. POST routes require `application/json` (`415`), cap
the body at 1 MB (`413`), validate against a schema (`400`), report a missing key as
`503` and any upstream failure or 60-second timeout as `502`. Every external link is
filtered through `safeHref`, which allows only `http:` and `https:`, and rendered with
`rel="noopener noreferrer"`. Model output is treated as untrusted data throughout.

## Limitations

- Noisy-OR assumes parents are conditionally independent. Two causes that are really the
  same cause wearing different hats will be double-counted.
- Base rates and strengths are a model's estimates, not measurements. The confidence dot
  and the assumptions list are there because those numbers deserve suspicion.
- Polymarket matching is token overlap, not semantics; check the question before
  adopting its price.
- Follow-up suggestions are filtered by a keyword shape test before they are offered
  as one-click what-ifs, because the model returns research actions there ("track
  UKMTO reports weekly") alongside real outcomes. The test is conservative and
  deliberately crude: anything it cannot read as an outcome stays plain text.
- Yahoo quotes are unofficial and unauthenticated. They fail open: a missing quote means
  the node keeps its modelled level.
- The graph is forced to a DAG. Feedback loops are broken at the weakest edge, which is
  a real modelling limitation, not a rendering one.

## Future work

Web-grounded citations behind `OPENROUTER_WEB=1`, a table view of the whole graph,
saving and sharing worlds between people, and moving Monte-Carlo into a worker so the
sample count can go up without touching drag latency.
