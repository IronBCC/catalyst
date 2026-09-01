import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "@/lib/http";

const schema = z.object({ ok: z.boolean() });

describe("readJson", () => {
  it("rejects text/plain with 415", async () => {
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: '{"ok":true}',
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects a body one byte above 1 MB with 413", async () => {
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(1_048_577),
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects malformed JSON with 400", async () => {
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects schema-invalid JSON with 400", async () => {
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"ok":"no"}',
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({ status: 400 });
  });

  it("returns parsed valid JSON", async () => {
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: '{"ok":true}',
    });

    await expect(readJson(request, schema)).resolves.toEqual({ ok: true });
  });
});
