export type SignInDecision = "allowed" | "not_invited" | "inactive";

/**
 * The CRM is invite-only: a Google account can sign in only if an admin has
 * already added that email (an invited or existing team member), or it is one
 * of the ADMIN_EMAILS bootstrap addresses. Anyone else is turned away rather
 * than being given an account.
 */
export function decideSignInAccess({
  email,
  existingUser,
  adminEmails,
}: {
  email: string | null | undefined;
  existingUser: { active: boolean } | null;
  adminEmails: string[];
}): SignInDecision {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return "not_invited";
  if (adminEmails.includes(normalized)) return "allowed";
  if (!existingUser) return "not_invited";
  return existingUser.active ? "allowed" : "inactive";
}
