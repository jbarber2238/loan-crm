import crypto from "crypto";
import { getPandaDocApiKey, getPandaDocWebhookSharedKey } from "@/server/settings";

// Thin wrapper around PandaDoc's public API — used to create a document
// from a lender's template, send it to the borrower (silently, since they
// fill it out from inside our own borrower-upload page rather than a
// PandaDoc email), and pull the finished PDF back down once a webhook says
// it's done. See src/app/api/webhooks/pandadoc/route.ts for the other half.
// The API key and webhook shared key live in Settings → Integrations
// (company_settings table), not environment variables — Justin manages
// them from the app rather than editing deploy config.

const BASE_URL = "https://api.pandadoc.com/public/v1";

export class PandaDocNotConfiguredError extends Error {
  constructor() {
    super("PandaDoc isn't connected yet — add your API key in Settings → Integrations.");
    this.name = "PandaDocNotConfiguredError";
  }
}

export class PandaDocApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`PandaDoc API error (${status}): ${body}`);
    this.name = "PandaDocApiError";
  }
}

async function apiKey(): Promise<string> {
  const key = await getPandaDocApiKey();
  if (!key) throw new PandaDocNotConfiguredError();
  return key;
}

async function pandaDocFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `API-Key ${await apiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new PandaDocApiError(res.status, await res.text().catch(() => ""));
  }
  return res;
}

interface CreateDocumentResult {
  id: string;
  status: string;
}

/**
 * Creates a document from a lender's PandaDoc template, pre-filling
 * whatever deal data we already have (so the borrower isn't re-typing their
 * name/address/loan amount) and naming the borrower as the recipient who
 * fills out the rest. Does NOT send it — call sendDocumentSilently after.
 */
export async function createDocumentFromTemplate({
  templateUuid,
  name,
  recipientEmail,
  recipientFirstName,
  recipientLastName,
  tokens,
}: {
  templateUuid: string;
  name: string;
  recipientEmail: string;
  recipientFirstName: string;
  recipientLastName: string;
  tokens?: Record<string, string>;
}): Promise<CreateDocumentResult> {
  const res = await pandaDocFetch("/documents", {
    method: "POST",
    body: JSON.stringify({
      name,
      template_uuid: templateUuid,
      recipients: [
        {
          email: recipientEmail,
          first_name: recipientFirstName,
          last_name: recipientLastName,
          role: "Client",
        },
      ],
      tokens: tokens ? Object.entries(tokens).map(([tokenName, value]) => ({ name: tokenName, value })) : undefined,
    }),
  });
  return res.json();
}

/**
 * Document creation is async on PandaDoc's side (it starts as
 * "document.uploaded" while the template is processed) — this polls until
 * it reaches "document.draft" and is ready to send, or gives up.
 */
export async function waitUntilDraft(documentId: string, { maxAttempts = 10, delayMs = 1500 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await pandaDocFetch(`/documents/${documentId}`);
    const doc = await res.json();
    if (doc.status === "document.draft") return doc;
    if (doc.status === "document.creation_failed") {
      throw new Error(`PandaDoc failed to create document ${documentId} from its template`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`PandaDoc document ${documentId} never reached document.draft in time`);
}

/**
 * Sends the document so it's ready to be filled/signed, without PandaDoc
 * emailing the recipient — the borrower gets to it through a link on our
 * own borrower-upload page instead (see createSigningSessionUrl below).
 */
export async function sendDocumentSilently(documentId: string) {
  await pandaDocFetch(`/documents/${documentId}/send`, {
    method: "POST",
    body: JSON.stringify({ silent: true }),
  });
}

/**
 * Creates a fresh, time-limited signing-session URL for the borrower to
 * fill/sign the document — generated on demand each time they click "Fill
 * out" rather than stored, since sessions expire.
 */
export async function createSigningSessionUrl(documentId: string, recipientEmail: string): Promise<string> {
  const res = await pandaDocFetch(`/documents/${documentId}/session`, {
    method: "POST",
    body: JSON.stringify({ recipient: recipientEmail, lifetime: 1800 }),
  });
  const { id } = await res.json();
  return `https://app.pandadoc.com/s/${id}`;
}

/**
 * Downloads the final signed/filled PDF. Returns null (not an error) if
 * PandaDoc hasn't finished assembling it yet — callers should treat that as
 * "try again shortly," which in practice means waiting for the next webhook.
 */
export async function downloadCompletedDocument(documentId: string): Promise<Buffer | null> {
  const res = await fetch(`${BASE_URL}/documents/${documentId}/download-protected`, {
    headers: { Authorization: `API-Key ${await apiKey()}` },
  });
  if (res.status === 202) return null;
  if (!res.ok) throw new PandaDocApiError(res.status, await res.text().catch(() => ""));
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Verifies an incoming webhook really came from PandaDoc — HMAC-SHA256 over
 * the raw request body using the shared key from the webhook subscription,
 * compared with a timing-safe check so this can't leak the expected value
 * through response-time differences.
 */
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const sharedKey = await getPandaDocWebhookSharedKey();
  if (!sharedKey || !signature) return false;
  const expected = crypto.createHmac("sha256", sharedKey).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
