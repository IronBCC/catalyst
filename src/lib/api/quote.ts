import { jsonError } from "@/lib/http";
import { defaultDeps, type Deps } from "@/lib/llm";
import { fetchQuotes } from "@/lib/market";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "quote lookup failed";

export async function handleQuote(
  req: Request,
  deps: Pick<Deps, "fetchImpl"> = defaultDeps(),
): Promise<Response> {
  const value = new URL(req.url).searchParams.get("symbols") ?? "";
  const symbols = value
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
  if (symbols.length > 10) return jsonError(400, "too many symbols");

  try {
    return Response.json({ data: await fetchQuotes(symbols, deps.fetchImpl), error: null });
  } catch (error) {
    return Response.json({ data: null, error: errorMessage(error) });
  }
}
