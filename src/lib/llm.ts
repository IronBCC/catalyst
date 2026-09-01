import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { HttpError } from "@/lib/http";

export type Deps = {
  fetchImpl: typeof fetch;
  env: Record<string, string | undefined>;
};

export const defaultDeps = (): Deps => ({ fetchImpl: fetch, env: process.env });

export const modelId = (env: Deps["env"]) =>
  env.OPENROUTER_MODEL ?? "openai/gpt-5.6-luna";

export const hasKey = (deps: Deps) => Boolean(deps.env.OPENROUTER_API_KEY);

export function llm(deps: Deps) {
  return createOpenRouter({
    apiKey: deps.env.OPENROUTER_API_KEY,
    fetch: deps.fetchImpl,
  }).chat(modelId(deps.env), {
    reasoning: { effort: "low" },
    provider: { require_parameters: true },
  });
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "invalid structured output";

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

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model: llm(deps),
        output: Output.object({ schema }),
        system,
        prompt: nextPrompt,
        temperature: 0.2,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(60_000),
      });
      return result.output as T;
    } catch (error) {
      if (isAbort(error)) throw new HttpError(502, "upstream timeout");
      lastError = error;
      nextPrompt =
        prompt +
        "\n\nYour previous JSON failed validation. Return only a corrected object. Validation error: " +
        errorMessage(error);
    }
  }

  throw new HttpError(502, "invalid structured output: " + errorMessage(lastError));
}
