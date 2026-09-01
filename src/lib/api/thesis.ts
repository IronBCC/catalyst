import { HttpError, jsonError, readJson } from "@/lib/http";
import { defaultDeps, hasKey, structured, type Deps } from "@/lib/llm";
import { THESIS_SYSTEM, thesisPrompt } from "@/lib/prompts";
import { LlmThesis, ThesisInputSchema } from "@/lib/schema";

export async function handleThesis(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (!hasKey(deps)) return jsonError(503, "live generation off");

  try {
    const input = await readJson(req, ThesisInputSchema);
    return Response.json(await structured(deps, LlmThesis, THESIS_SYSTEM, thesisPrompt(input)));
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.message);
    return jsonError(502, "upstream request failed");
  }
}
