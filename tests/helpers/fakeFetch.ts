export type FakeFetch = typeof fetch & {
  calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>;
};

/**
 * Structured output arrives as a forced tool call, so a fake upstream has to
 * answer with tool_calls rather than message content.
 */
export function chatResponse(object: unknown): Response {
  return Response.json({
    id: "fake",
    model: "fake/model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "emit", arguments: JSON.stringify(object) },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

export function fakeFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
): FakeFetch {
  const calls: FakeFetch["calls"] = [];
  const result = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return handler(input, init);
  }) as FakeFetch;
  result.calls = calls;
  return result;
}
