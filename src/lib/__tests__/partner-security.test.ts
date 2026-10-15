import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/partner/password";
import { decryptSecret, encryptSecret, hashToken, newToken } from "@/server/partner/crypto";

describe("partner passwords", () => {
  it("hashes with a salt and verifies only the right password", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong password!!", a)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("banking encryption", () => {
  it("round-trips and never stores plaintext", () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-vitest";
    const encrypted = encryptSecret('{"account":"123456789"}');
    expect(encrypted).not.toContain("123456789");
    expect(decryptSecret(encrypted)).toBe('{"account":"123456789"}');
  });

  it("detects tampering", () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-vitest";
    const parts = encryptSecret("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("hashes tokens deterministically and generates unique ones", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(newToken()).not.toBe(newToken());
  });
});

import { isValidRoutingNumber } from "@/lib/partner-constants";

describe("routing number check", () => {
  it("accepts a valid ABA number and rejects bad ones", () => {
    expect(isValidRoutingNumber("021000021")).toBe(true); // a real, published ABA number
    expect(isValidRoutingNumber("021000022")).toBe(false);
    expect(isValidRoutingNumber("12345")).toBe(false);
    expect(isValidRoutingNumber("abcdefghi")).toBe(false);
  });
});
