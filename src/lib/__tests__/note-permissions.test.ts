import { describe, expect, it } from "vitest";
import { canEditDealNote } from "@/lib/note-permissions";

describe("canEditDealNote", () => {
  const author = { id: "a", isAdmin: false };
  const admin = { id: "b", isAdmin: true };
  const other = { id: "c", isAdmin: false };

  it("lets the author edit their own note", () => {
    expect(canEditDealNote({ authorUserId: "a" }, author)).toBe(true);
  });
  it("does not let an admin or anyone else edit another person's note", () => {
    expect(canEditDealNote({ authorUserId: "a" }, admin)).toBe(false);
    expect(canEditDealNote({ authorUserId: "a" }, other)).toBe(false);
  });
  it("lets only an admin edit a note with no author", () => {
    expect(canEditDealNote({ authorUserId: null }, admin)).toBe(true);
    expect(canEditDealNote({ authorUserId: null }, other)).toBe(false);
  });
});
