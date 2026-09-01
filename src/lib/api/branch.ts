import type { repairBranch as repairBranchType } from "../../../tests/stubs/repair";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { defaultDeps, hasKey, structured, type Deps } from "@/lib/llm";
import { BRANCH_SYSTEM, branchPrompt } from "@/lib/prompts";
import { BranchInputSchema, LlmBranch } from "@/lib/schema";

type RepairBranch = typeof repairBranchType;

const unavailableRepair: RepairBranch = () => {
  throw new HttpError(502, "branch repair unavailable");
};

export async function handleBranch(
  req: Request,
  deps: Deps = defaultDeps(),
  repair: RepairBranch = unavailableRepair,
): Promise<Response> {
  if (!hasKey(deps)) return jsonError(503, "live generation off");

  try {
    const input = await readJson(req, BranchInputSchema);
    const branch = await structured(deps, LlmBranch, BRANCH_SYSTEM, branchPrompt(input));
    return Response.json(repair(branch, input.graph));
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.message);
    return jsonError(502, "upstream request failed");
  }
}
