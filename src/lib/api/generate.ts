import { HttpError, jsonError, readJson } from "@/lib/http";
import { defaultDeps, hasKey, structured } from "@/lib/llm";
import { GENERATE_SYSTEM, generatePrompt } from "@/lib/prompts";
import { GenerateInputSchema, LlmGraph } from "@/lib/schema";

const errorResponse = (error: unknown) =>
  error instanceof HttpError
    ? jsonError(error.status, error.message)
    : jsonError(502, "upstream request failed");

export async function handleGenerate(req: Request, deps = defaultDeps()): Promise<Response> {
  if (!hasKey(deps)) return jsonError(503, "live generation off");

  try {
    const input = await readJson(req, GenerateInputSchema);
    // Not streamed: structured output here is a forced tool call, and tool
    // arguments only become a valid object once they are complete. The client
    // reads this the same way it reads a stream, and ticks status lines while
    // it waits.
    const graph = await structured(deps, LlmGraph, GENERATE_SYSTEM, generatePrompt(input));
    return new Response(JSON.stringify(graph), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
