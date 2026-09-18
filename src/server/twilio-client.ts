import Twilio from "twilio";
import { getTwilioSettings } from "@/server/settings";

// Thin wrapper around Twilio's API for borrower texting & calling (see the
// "Borrower texting & calling" section of the multi-tenant plan doc) — same
// "credentials live in company_settings, not env vars" pattern as
// src/server/stripe.ts and src/server/pandadoc.ts, and deliberately kept in
// its own file for the same reason: one place that knows how to talk to
// Twilio, everything else (routing, webhooks, actions) goes through it.

export class TwilioNotConfiguredError extends Error {
  constructor() {
    super("Texting/calling isn't connected yet — add your Twilio number and credentials in Settings → Phone.");
    this.name = "TwilioNotConfiguredError";
  }
}

async function twilioClient(): Promise<{ client: Twilio.Twilio; phoneNumber: string; authToken: string }> {
  const settings = await getTwilioSettings();
  if (!settings) throw new TwilioNotConfiguredError();
  return {
    client: Twilio(settings.accountSid, settings.authToken),
    phoneNumber: settings.phoneNumber,
    authToken: settings.authToken,
  };
}

export interface SendSmsResult {
  sid: string;
  status: string;
  from: string;
}

/** Sends one SMS from the shared company number. Throws TwilioNotConfiguredError if Settings → Phone isn't set up yet. */
export async function sendSms({
  to,
  body,
  statusCallbackUrl,
}: {
  to: string;
  body: string;
  statusCallbackUrl?: string;
}): Promise<SendSmsResult> {
  const { client, phoneNumber } = await twilioClient();
  const message = await client.messages.create({
    to,
    from: phoneNumber,
    body,
    ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
  });
  return { sid: message.sid, status: message.status, from: phoneNumber };
}

export interface InitiateBridgeCallResult {
  sid: string;
  status: string;
}

/**
 * Click-to-call bridge (see the plan doc — chosen over an in-browser
 * softphone): dials the staff member's own phone first; when they pick up,
 * Twilio requests `connectTwimlUrl`, which responds with TwiML dialing the
 * borrower and bridging the two calls. The borrower's caller ID shows the
 * shared company number throughout, never the staff member's own number.
 */
export async function initiateBridgeCall({
  staffPhone,
  connectTwimlUrl,
  statusCallbackUrl,
}: {
  staffPhone: string;
  connectTwimlUrl: string;
  statusCallbackUrl?: string;
}): Promise<InitiateBridgeCallResult> {
  const { client, phoneNumber } = await twilioClient();
  const call = await client.calls.create({
    to: staffPhone,
    from: phoneNumber,
    url: connectTwimlUrl,
    ...(statusCallbackUrl
      ? { statusCallback: statusCallbackUrl, statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] }
      : {}),
  });
  return { sid: call.sid, status: call.status };
}

/**
 * Twilio signs a webhook against the exact URL it was configured to call.
 * `request.url` can report the wrong scheme/host behind Vercel's proxy, so
 * this rebuilds the URL from APP_URL (the same origin every Twilio URL is
 * built from elsewhere in this file) plus the incoming request's own path
 * and query string, rather than trusting the proxy-seen origin.
 */
export function canonicalWebhookUrl(request: Request): string {
  const incoming = new URL(request.url);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}${incoming.pathname}${incoming.search}`;
}

/** Parses a Twilio webhook's application/x-www-form-urlencoded POST body into a plain string map, and verifies its signature against the canonical URL. Throws if the signature doesn't check out. */
export async function verifiedTwilioParams(request: Request): Promise<Record<string, string>> {
  const rawBody = await request.text();
  const parsed = new URLSearchParams(rawBody);
  const params: Record<string, string> = {};
  for (const [key, value] of parsed.entries()) params[key] = value;

  const signature = request.headers.get("x-twilio-signature");
  const ok = await verifyTwilioSignature({ url: canonicalWebhookUrl(request), params, signature });
  if (!ok) throw new Error("Twilio webhook signature verification failed");
  return params;
}

export function twimlResponse(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Verifies an incoming webhook really came from Twilio, using its own SDK
 * helper (HMAC-SHA1 over the full URL + sorted POST params, timing-safe
 * compare) against the auth token from Settings → Phone. Every Twilio
 * webhook route must call this before acting on the payload.
 */
export async function verifyTwilioSignature({
  url,
  params,
  signature,
}: {
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): Promise<boolean> {
  const settings = await getTwilioSettings();
  if (!settings || !signature) return false;
  return Twilio.validateRequest(settings.authToken, signature, url, params);
}
