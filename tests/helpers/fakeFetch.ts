export type FakeFetch = typeof fetch & {
  calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>;
};

export function chatResponse(object: unknown): Response {
  return Response.json({
    choices: [
      {
        message: { role: "assistant", content: JSON.stringify(object) },
        finish_reason: "stop",
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
