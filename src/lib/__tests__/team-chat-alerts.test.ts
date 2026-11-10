import { describe, expect, it } from "vitest";
import { isPersonalMessage } from "@/lib/team-chat-alerts";

const me = { id: "u1", name: "Emily Smith" };

describe("isPersonalMessage", () => {
  it("treats every direct message as personal", () => {
    expect(isPersonalMessage({ kind: "dm" }, "hey", me)).toBe(true);
  });

  it("treats a group, deal or General message as personal only when it tags me", () => {
    expect(isPersonalMessage({ kind: "general" }, "lunch is here", me)).toBe(false);
    expect(isPersonalMessage({ kind: "deal" }, "@Emily can you check the appraisal?", me)).toBe(true);
    expect(isPersonalMessage({ kind: "group" }, "@Emily Smith ping", me)).toBe(true);
  });

  it("does not count someone else's tag or an email address", () => {
    expect(isPersonalMessage({ kind: "group" }, "@Jordan can you look?", me)).toBe(false);
    expect(isPersonalMessage({ kind: "group" }, "send it to team@Emily.com", me)).toBe(false);
  });
});
