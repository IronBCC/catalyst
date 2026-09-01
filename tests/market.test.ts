import { describe, expect, it, vi } from "vitest";
import { handleQuote } from "@/lib/api/quote";
import {
  parsePolymarket,
  parseYahoo,
  scoreMatch,
  ttlCache,
} from "@/lib/market";

describe("market helpers", () => {
  it("scores overlapping market language above an unrelated market", () => {
    const related = scoreMatch(
      "Strait of Hormuz reopens to tanker traffic by Oct 1?",
      "Strait of Hormuz traffic returns to normal by December 31?",
    );
    const unrelated = scoreMatch(
      "Strait of Hormuz reopens to tanker traffic by Oct 1?",
      "US Open ATP final",
    );

    expect(related).toBeGreaterThan(unrelated);
  });

  it("parses open Yes/No Polymarket prices", () => {
    const matches = parsePolymarket({
      events: [
        {
          slug: "strait-of-hormuz-reopens",
          title: "Strait of Hormuz reopens",
          markets: [
            {
              question: "Will the Strait of Hormuz reopen?",
              outcomes: '["Yes", "No"]',
              outcomePrices: '["0.275", "0.725"]',
              closed: false,
              volume: 1_200,
              endDate: "2026-10-01T00:00:00Z",
            },
          ],
        },
      ],
    });

    expect(matches).toMatchObject([
      {
        title: "Will the Strait of Hormuz reopen?",
        url: "https://polymarket.com/event/strait-of-hormuz-reopens",
        yes: 0.275,
        volume: 1_200,
      },
    ]);
  });

  it("parses a Yahoo chart quote", () => {
    const quote = parseYahoo(
      {
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 140.6,
                chartPreviousClose: 139.6,
                currency: "USD",
                regularMarketTime: 1_788_307_200,
              },
              timestamp: [1_788_307_200],
            },
          ],
          error: null,
        },
      },
      "AAPL",
    );

    expect(quote).toMatchObject({ symbol: "AAPL", price: 140.6, currency: "USD" });
  });

  it("expires TTL cache entries", () => {
    vi.useFakeTimers();
    try {
      const cache = ttlCache<string>(10);
      cache.set("market", "cached");
      vi.advanceTimersByTime(11);

      expect(cache.get("market")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects quote requests with more than ten symbols", async () => {
    const symbols = Array.from({ length: 11 }, (_, index) => "S" + index).join(",");
    const response = await handleQuote(
      new Request("http://test/api/quote?symbols=" + symbols),
    );

    expect(response.status).toBe(400);
  });
});
