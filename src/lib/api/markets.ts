import { jsonError } from "@/lib/http";
import { defaultDeps, type Deps } from "@/lib/llm";
import { searchPolymarket } from "@/lib/market";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "market lookup failed";

export async function handleMarkets(
  req: Request,
  deps: Pick<Deps, "fetchImpl"> = defaultDeps(),
): Promise<Response> {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  if (query.length > 200) return jsonError(400, "query too long");
  if (!query) return Response.json({ data: [], error: null });

  try {
    return Response.json({ data: await searchPolymarket(query, deps.fetchImpl), error: null });
  } catch (error) {
    return Response.json({ data: null, error: errorMessage(error) });
  }
}
