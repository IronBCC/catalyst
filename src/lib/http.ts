import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const jsonError = (status: number, error: string) =>
  Response.json({ error }, { status });

async function readBody(req: Request, maxBytes: number): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new HttpError(413, "request body too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readJson<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes = 1_048_576,
): Promise<T> {
  if (req.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
    throw new HttpError(415, "content-type must be application/json");
  }

  let value: unknown;
  try {
    value = JSON.parse(await readBody(req, maxBytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "malformed JSON");
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "invalid request body");
  return parsed.data;
}
