export type MarketMatch = {
  title: string;
  url: string;
  yes: number;
  volume: number;
  endDate: string | null;
  source: "polymarket";
};

export type Quote = {
  symbol: string;
  price: number;
  changePct: number;
  currency: string;
  time: string;
};

const stopwords = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "not",
  "that",
  "the",
  "this",
  "to",
  "will",
  "with",
]);

export function tokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= 3 && !stopwords.has(token),
  );
}

export function scoreMatch(a: string, b: string): number {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;

  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / union.size;
}

export function ttlCache<T>(ms: number) {
  const values = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string): T | undefined {
      const entry = values.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        values.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      values.set(key, { value, expiresAt: Date.now() + ms });
    },
  };
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const stringArray = (value: unknown): string[] | null => {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
    ? parsed
    : null;
};

export function parsePolymarket(json: unknown): MarketMatch[] {
  const root = asRecord(json);
  const events = Array.isArray(json)
    ? json
    : Array.isArray(root?.events)
      ? root.events
      : Array.isArray(root?.data)
        ? root.data
        : root
          ? [root]
          : [];
  const matches: MarketMatch[] = [];

  for (const eventValue of events) {
    const event = asRecord(eventValue);
    if (!event) continue;
    const markets = Array.isArray(event.markets) ? event.markets : [event];

    for (const marketValue of markets) {
      const market = asRecord(marketValue);
      if (!market || market.closed === true || market.active === false) continue;
      const outcomes = stringArray(market.outcomes);
      const prices = stringArray(market.outcomePrices);
      if (
        !outcomes ||
        !prices ||
        outcomes.length !== 2 ||
        prices.length !== 2 ||
        outcomes[0].toLowerCase() !== "yes" ||
        outcomes[1].toLowerCase() !== "no"
      ) {
        continue;
      }

      const yes = asNumber(prices[0]);
      const volume = asNumber(market.volume ?? event.volume) ?? 0;
      const title =
        typeof market.question === "string"
          ? market.question
          : typeof market.title === "string"
            ? market.title
            : typeof event.title === "string"
              ? event.title
              : null;
      const slug =
        typeof event.slug === "string"
          ? event.slug
          : typeof market.slug === "string"
            ? market.slug
            : null;
      if (yes === null || !title || !slug) continue;

      matches.push({
        title,
        url: "https://polymarket.com/event/" + slug,
        yes,
        volume,
        endDate:
          typeof market.endDate === "string"
            ? market.endDate
            : typeof event.endDate === "string"
              ? event.endDate
              : null,
        source: "polymarket",
      });
    }
  }

  return matches.sort((a, b) => b.volume - a.volume).slice(0, 5);
}

export function parseYahoo(json: unknown, symbol: string): Quote | null {
  const root = asRecord(json);
  const chart = asRecord(root?.chart);
  const result = Array.isArray(chart?.result) ? asRecord(chart.result[0]) : null;
  const meta = asRecord(result?.meta);
  if (!result || !meta) return null;

  const indicators = asRecord(result.indicators);
  const quotes = Array.isArray(indicators?.quote) ? indicators.quote : [];
  const quote = asRecord(quotes[0]);
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const lastClose = [...closes].reverse().map(asNumber).find((value) => value !== null);
  const price = asNumber(meta.regularMarketPrice) ?? lastClose ?? null;
  if (price === null) return null;

  const previous = asNumber(meta.regularMarketPreviousClose) ?? asNumber(meta.chartPreviousClose);
  const directChange = asNumber(meta.regularMarketChangePercent);
  const timestamp =
    asNumber(meta.regularMarketTime) ??
    (Array.isArray(result.timestamp)
      ? [...result.timestamp].reverse().map(asNumber).find((value) => value !== null)
      : null) ??
    null;

  return {
    symbol,
    price,
    changePct: directChange ?? (previous && previous !== 0 ? ((price - previous) / previous) * 100 : 0),
    currency: typeof meta.currency === "string" ? meta.currency : "",
    time: timestamp === null ? new Date(0).toISOString() : new Date(timestamp * 1_000).toISOString(),
  };
}

const marketCache = ttlCache<MarketMatch[]>(60_000);
const quoteCache = ttlCache<Quote | null>(60_000);

export async function searchPolymarket(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketMatch[]> {
  const cached = marketCache.get(query);
  if (cached) return cached;

  const response = await fetchImpl(
    "https://gamma-api.polymarket.com/public-search?q=" +
      encodeURIComponent(query) +
      "&limit_per_type=5",
  );
  if (!response.ok) throw new Error("Polymarket request failed");
  const matches = parsePolymarket(await response.json());
  marketCache.set(query, matches);
  return matches;
}

export async function fetchQuotes(
  symbols: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, Quote | null>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const cached = quoteCache.get(symbol);
      if (cached !== undefined) return [symbol, cached] as const;

      try {
        const response = await fetchImpl(
          "https://query1.finance.yahoo.com/v8/finance/chart/" +
            encodeURIComponent(symbol) +
            "?range=1d&interval=1m",
          { headers: { "User-Agent": "Mozilla/5.0" } },
        );
        if (!response.ok) throw new Error("Yahoo request failed");
        const quote = parseYahoo(await response.json(), symbol);
        quoteCache.set(symbol, quote);
        return [symbol, quote] as const;
      } catch {
        return [symbol, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
