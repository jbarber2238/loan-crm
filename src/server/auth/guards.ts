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

// Client-need catalog entries get added/edited by processors as part of
// normal deal work, not just by admins — but only for entries they're
// allowed to touch (custom ones; standard ones stay admin-curated).
export async function requireClientNeedsEditor() {
  const user = await requireUser();
  if (!user.isAdmin && user.baseRole !== "processor") {
    throw new Error("Only admins and processors can manage client needs");
  }
  return user;
}
