import { HttpError, jsonError, readJson } from "@/lib/http";
import { repairBranch } from "@/lib/engine/repair";
import { defaultDeps, hasKey, structured, type Deps } from "@/lib/llm";
import { BRANCH_SYSTEM, branchPrompt } from "@/lib/prompts";
import { BranchInputSchema, LlmBranch } from "@/lib/schema";

type RepairBranch = typeof repairBranch;

export async function handleBranch(
  req: Request,
  deps: Deps = defaultDeps(),
  repair: RepairBranch = repairBranch,
): Promise<Response> {
  if (!hasKey(deps)) return jsonError(503, "live generation off");

  try {
    const input = await readJson(req, BranchInputSchema);
    const branch = await structured(deps, LlmBranch, BRANCH_SYSTEM, branchPrompt(input));
    // Each candidate is repaired against the same graph: an edge that would
    // close a cycle is dropped there, not here.
    return Response.json({
      candidates: branch.candidates.map((candidate) => repair(candidate, input.graph)),
    });
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.message);
    return jsonError(502, "upstream request failed");
  }
}
