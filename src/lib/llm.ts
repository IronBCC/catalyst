import { generateText, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { HttpError } from "@/lib/http";

export type Deps = {
  fetchImpl: typeof fetch;
  env: Record<string, string | undefined>;
};

export const defaultDeps = (): Deps => ({ fetchImpl: fetch, env: process.env });

/**
 * Measured 2026-09-01 across six prompts (see `npm run quality`):
 * glm-5.3-flash produced 7/7 graphs at 90% on the quality checks with a 34 s
 * median, against poolside/laguna-s-2.1 at 6/7, 80% and 142 s. It needs the
 * provider pin below; on the default route it answers with an empty tool call.
 */
export const modelId = (env: Deps["env"]) => env.OPENROUTER_MODEL ?? "z-ai/glm-5.3-flash";

export const hasKey = (deps: Deps) => Boolean(deps.env.OPENROUTER_API_KEY);

/**
 * `OPENROUTER_REASONING` takes a number (a reasoning token budget), `off`, or an
 * effort level. All three are needed: qwen refuses a named `tool_choice` while
 * thinking mode is on, and some endpoints refuse to switch reasoning off at all.
 */
const reasoningSetting = (env: Deps["env"]) => {
  const raw = env.OPENROUTER_REASONING ?? "low";
  if (raw === "off") return { enabled: false } as unknown as { effort: "low" };
  const budget = Number(raw);
  return Number.isFinite(budget) && budget > 0
    ? { max_tokens: budget }
    : { effort: raw as "low" | "medium" | "high" };
};

/**
 * Provider routing is a setting because a model is only as good as the endpoint
 * it lands on. Measured 2026-09-01: z-ai/glm-5.3-flash on Together answers a
 * forced tool call with `{}` and zero completion tokens while still billing the
 * prompt; the same request on Fireworks returns a full, schema-valid graph.
 */
const providerSetting = (env: Deps["env"]) => {
  const order = (env.OPENROUTER_PROVIDER_ORDER ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  // Fallbacks defeat the point of pinning: the endpoint being avoided is
  // usually the one that answers instantly with an empty tool call.
  return order.length ? { order, allow_fallbacks: false } : undefined;
};

export function llm(deps: Deps) {
  return createOpenRouter({
    apiKey: deps.env.OPENROUTER_API_KEY,
    fetch: deps.fetchImpl,
  }).chat(modelId(deps.env), {
    provider: providerSetting(deps.env),
    // Some providers turn reasoning on by default and let it eat the whole
    // output budget before the tool call is emitted, which comes back as an
    // empty or truncated set of arguments. Omitting the field is not the same
    // as switching it off, so "off" sends an explicit disable.
    // Some endpoints refuse to have reasoning switched off at all, so the knob
    // caps it instead: a number is a reasoning token budget, anything else is
    // an effort level. Capping is what actually matters, because an uncapped
    // reasoning pass can consume the whole output budget before the tool call.
    reasoning: reasoningSetting(deps.env),
  });
}

/**
 * Structured output goes through a forced tool call rather than
 * `response_format: json_schema`.
 *
 * Verified 2026-09-01 against poolside/laguna-s-2.1: OpenRouter advertises
 * `tools` and `tool_choice` for it but not `response_format`, and a json_schema
 * request either 404s (with `require_parameters`) or is silently ignored and
 * comes back as prose (without it). A forced tool call returns valid arguments.
 * `require_parameters` is off for the same reason: it refuses to route a named
 * `tool_choice` for this model.
 */
const EMIT_DESCRIPTION = "Emit the result. Call this exactly once with the complete object.";

/**
 * Five seconds under the routes' `maxDuration = 60`, so this abort always fires
 * first and the user gets the app's own "upstream timeout" with a Retry rather
 * than the platform's kill and a Vercel 504 page. Raise both together or not at
 * all.
 */
export const TIMEOUT_MS = 55_000;

/**
 * A whole graph is a large tool-call payload, and a model that writes densely
 * will run out of room mid-JSON and come back truncated rather than wrong. The
 * cap is a setting so a verbose model can be given more room without a rebuild.
 */
export const maxOutputTokens = (env: Deps["env"]) =>
  Number(env.OPENROUTER_MAX_OUTPUT_TOKENS ?? 32_000);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "invalid structured output";

const NO_TOOL_CALL = /did not contain a call|no structured output|ToolChoiceViolation/i;

const correction = (error: unknown) =>
  NO_TOOL_CALL.test(errorMessage(error))
    ? "You did not call the tool. Reply with a single call to the `emit` tool and no prose."
    : "Your previous arguments failed validation. Call `emit` again with a corrected object. Validation error: " +
      errorMessage(error);

const isAbort = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  (error as { name?: unknown }).name === "AbortError";

export async function structured<T>(
  deps: Deps,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
): Promise<T> {
  let nextPrompt = prompt;
  let lastError: unknown;

  // Three attempts, not two: a model that skips the tool call once usually
  // makes it on the retry, and the correction it needs differs from a
  // validation failure.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await generateText({
        model: llm(deps),
        tools: { emit: tool({ description: EMIT_DESCRIPTION, inputSchema: schema }) },
        toolChoice: { type: "tool", toolName: "emit" },
        system,
        prompt: nextPrompt,
        temperature: 0.2,
        maxRetries: 0,
        maxOutputTokens: maxOutputTokens(deps.env),
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const call = result.toolCalls[0];
      if (!call) throw new Error("model returned no structured output");
      return schema.parse(call.input);
    } catch (error) {
      if (isAbort(error)) throw new HttpError(502, "upstream timeout");
      lastError = error;
      nextPrompt = prompt + "\n\n" + correction(error);
    }
  }

  throw new HttpError(502, "invalid structured output: " + errorMessage(lastError));
}
