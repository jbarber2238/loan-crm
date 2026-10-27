import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "../safe-redirect";

describe("safeCallbackPath", () => {
  it("keeps same-site paths, query strings included", () => {
    expect(safeCallbackPath("/pipeline")).toBe("/pipeline");
    expect(safeCallbackPath("/oauth/authorize?client_id=a&state=b")).toBe("/oauth/authorize?client_id=a&state=b");
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "pipeline", "", "/a\nb"])("refuses %j", (value) => {
    expect(safeCallbackPath(value)).toBeNull();
  });

  it("refuses non-strings", () => {
    expect(safeCallbackPath(undefined)).toBeNull();
    expect(safeCallbackPath(["/a", "/b"])).toBeNull();
  });
});
