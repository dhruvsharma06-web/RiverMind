import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth-token";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/bounties")).toBe("/bounties");
    expect(safeNext("/bounties/abc?x=1#y")).toBe("/bounties/abc?x=1#y");
    expect(safeNext("/")).toBe("/");
  });
  it.each([
    null,
    "",
    "bounties",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/\nfoo",
    "///evil.example",
  ])("rejects %j", (value) => {
    expect(safeNext(value)).toBe("/river");
  });
  it("uses a custom fallback", () => {
    expect(safeNext("//x", "/council")).toBe("/council");
  });
});
