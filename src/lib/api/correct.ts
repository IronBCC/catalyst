import { HttpError, jsonError, readJson } from "@/lib/http";
import { repairCorrection } from "@/lib/engine/repair";
import { defaultDeps, hasKey, structured } from "@/lib/llm";
import { CORRECT_SYSTEM, correctPrompt } from "@/lib/prompts";
import { CorrectInputSchema, LlmBranchItem } from "@/lib/schema";

type RepairCorrection = typeof repairCorrection;

export async function handleCorrect(
  req: Request,
  deps = defaultDeps(),
  repair: RepairCorrection = repairCorrection,
): Promise<Response> {
  if (!hasKey(deps)) return jsonError(503, "live generation off");

  try {
    const input = await readJson(req, CorrectInputSchema);
    if (!input.graph.nodes.some((node) => node.id === input.nodeId)) {
      return jsonError(422, "no such node");
    }
    const item = await structured(deps, LlmBranchItem, CORRECT_SYSTEM, correctPrompt(input));
    return Response.json(repair(item, input.graph, input.nodeId));
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.message);
    // A correction that changes the node's kind, or names an id the graph does
    // not have, lands here: the graph is left exactly as it was.
    return jsonError(502, "upstream request failed");
  }
}
