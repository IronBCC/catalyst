import { streamObject } from "ai";
import type { repairGraph as repairGraphType } from "../../../tests/stubs/repair";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { defaultDeps, hasKey, llm, type Deps } from "@/lib/llm";
import { GENERATE_SYSTEM, generatePrompt } from "@/lib/prompts";
import { GenerateInputSchema, LlmGraph } from "@/lib/schema";

export type PendingGraphRepair = typeof repairGraphType;

const errorResponse = (error: unknown) =>
  error instanceof HttpError
    ? jsonError(error.status, error.message)
    : jsonError(502, "upstream request failed");

export async function handleGenerate(req: Request, deps = defaultDeps()): Promise<Response> {
  if (!hasKey(deps)) return jsonError(503, "live generation off");

  try {
    const input = await readJson(req, GenerateInputSchema);
    const result = streamObject({
      model: llm(deps),
      schema: LlmGraph,
      system: GENERATE_SYSTEM,
      prompt: generatePrompt(input),
      temperature: 0.2,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
    });
    return result.toTextStreamResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
