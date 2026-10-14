import { describe, expect, it } from "vitest";
import { decideSignInAccess } from "@/lib/sign-in-access";

const admins = ["boss@example.com"];

describe("decideSignInAccess", () => {
  it("lets in an invited or existing active team member", () => {
    expect(decideSignInAccess({ email: "emily@example.com", existingUser: { active: true }, adminEmails: admins })).toBe("allowed");
  });

  it("turns away a Google account nobody invited", () => {
    expect(decideSignInAccess({ email: "stranger@gmail.com", existingUser: null, adminEmails: admins })).toBe("not_invited");
    expect(decideSignInAccess({ email: null, existingUser: null, adminEmails: admins })).toBe("not_invited");
  });

  it("turns away a deactivated team member", () => {
    expect(decideSignInAccess({ email: "gone@example.com", existingUser: { active: false }, adminEmails: admins })).toBe("inactive");
  });

  it("always lets in a bootstrap admin email, in any case", () => {
    expect(decideSignInAccess({ email: "Boss@Example.com", existingUser: null, adminEmails: admins })).toBe("allowed");
  });
});
