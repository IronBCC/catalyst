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

- **Causal map.** Events and numeric variables laid out left to right in causal order.
  Every edge carries the mechanism behind it, the assumptions it rests on, and whether
  it is backed by evidence or is a modelling assumption.
- **Interventions, not correlations.** Pinning a node or dragging its slider is a
  do-operator: it fixes that node and lets only its descendants move. Parents stay put.
- **Worlds.** Baseline is read-only. Any edit forks a new world, so the original model
  is always one click away and two worlds can be compared column by column.
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

The four example chips work with **no key at all** — they load pre-built fixtures from
`public/fixtures/`. Without a key the generate, branch and thesis routes answer `503`
and the app says so in a banner instead of breaking.

## Checks

```bash
npm test          # unit: schema, engine, http, handlers, market, store, thesis, fixtures
npm run build     # production build, including the security headers
npm run test:e2e  # Playwright, every route mocked, no network
npm run check     # all three
```

One test is **not** in `npm run check` because it costs money and needs credentials:

```bash
OPENROUTER_API_KEY=... npm run test:live
```

It skips itself unless both `RUN_LIVE_OPENROUTER=1` and a key are set. **The live
OpenRouter path has not been exercised in this repository** — no key was available when
it was built, so the fixtures were generated from seed graphs run through the real
repair pass, and every other test mocks the provider. Run `npm run test:live` before
trusting the live path.

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
- Yahoo quotes are unofficial and unauthenticated. They fail open: a missing quote means
  the node keeps its modelled level.
- The graph is forced to a DAG. Feedback loops are broken at the weakest edge, which is
  a real modelling limitation, not a rendering one.

## Future work

Web-grounded citations behind `OPENROUTER_WEB=1`, a table view of the whole graph,
saving and sharing worlds between people, and moving Monte-Carlo into a worker so the
sample count can go up without touching drag latency.
