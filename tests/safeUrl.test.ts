import { expect, it } from "vitest";
import { safeHref } from "@/lib/safeUrl";

it("permits HTTP(S) URLs without fragments and rejects javascript URLs", () => {
  expect(safeHref("javascript:alert(1)")).toBeNull();
  expect(safeHref("https://a.b/c#x")).toBe("https://a.b/c");
});
