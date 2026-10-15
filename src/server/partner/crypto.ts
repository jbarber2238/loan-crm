import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

// AES-256-GCM for partner banking details. The key comes from PARTNER_BANKING_KEY
// (base64, 32 bytes) when set; otherwise it is derived from the app's existing
// NEXTAUTH_SECRET so no new setup is needed. Rotating that secret would make
// stored banking details unreadable, so don't rotate it without re-collecting.
function encryptionKey(): Buffer {
  const explicit = process.env.PARTNER_BANKING_KEY;
  if (explicit) {
    const key = Buffer.from(explicit, "base64");
    if (key.length !== 32) throw new Error("PARTNER_BANKING_KEY must be 32 bytes, base64-encoded");
    return key;
  }
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("No secret available to encrypt banking details");
  return Buffer.from(hkdfSync("sha256", secret, "manna-partner-banking", "banking-v1", 32));
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}
