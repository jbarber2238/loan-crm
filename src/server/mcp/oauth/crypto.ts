import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** RFC 7636 verifier: 43-128 characters from the unreserved set. */
export const isValidCodeVerifier = (v: string): boolean => /^[A-Za-z0-9\-._~]{43,128}$/.test(v);

/** S256 only: `plain` offers no protection against an intercepted code. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!isValidCodeVerifier(verifier)) return false;
  return safeEqual(createHash("sha256").update(verifier).digest("base64url"), challenge);
}
