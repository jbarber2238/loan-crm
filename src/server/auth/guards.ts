import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user || !session.user.active) {
    redirect("/sign-in");
  }
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new Error("Admin access required");
  }
  return user;
}

// Processors get admin-level access to a few specific areas they own
// day-to-day (client needs, a lender's submission/pricing setup) without
// being full admins otherwise.
export async function requireAdminOrProcessor() {
  const user = await requireUser();
  if (!user.isAdmin && user.baseRole !== "processor") {
    throw new Error("Only admins and processors can do this");
  }
  return user;
}

// Client-need catalog entries get added/edited by processors as part of
// normal deal work, not just by admins — full parity with admin, standard
// entries included (see requireAdminOrProcessor).
export const requireClientNeedsEditor = requireAdminOrProcessor;
