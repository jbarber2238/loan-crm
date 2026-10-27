"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { originFromHeaders } from "@/server/mcp/oauth/config";
import { approveAuthorization, checkAuthorizeRequest, denyAuthorization } from "@/server/mcp/oauth/flow";
import { dbOAuthStore } from "@/server/mcp/oauth/store";

const FIELDS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "resource"] as const;

/**
 * The admin pressed Approve or Cancel. The form's hidden fields are untrusted, so
 * the whole request is checked again against the registered client, and the
 * signed-in user is re-checked to be an active admin before any code is issued.
 */
export async function decideAuthorization(formData: FormData) {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.active || !user.isAdmin) throw new Error("Admin access required");

  const params: Record<string, string | undefined> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    params[field] = typeof value === "string" && value !== "" ? value : undefined;
  }
  const origin = originFromHeaders(await headers());
  const check = await checkAuthorizeRequest(params, dbOAuthStore, origin);
  if (!check.ok) {
    if ("redirectTo" in check) redirect(check.redirectTo);
    throw new Error(check.fatal);
  }
  if (formData.get("decision") !== "approve") redirect(denyAuthorization(check.request));
  redirect(await approveAuthorization(check.request, user.id, dbOAuthStore, new Date()));
}
