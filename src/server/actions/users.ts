"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireAdmin, requireUser } from "@/server/auth/guards";

export async function inviteUser(formData: FormData) {
  await requireAdmin();

  const email = formData.get("email");
  const baseRole = formData.get("baseRole");
  const isAdmin = formData.get("isAdmin") === "on";

  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Email is required");
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });
  if (existing) {
    throw new Error("A user with that email already exists — edit them in the list below.");
  }

  await db.insert(users).values({
    email: email.trim().toLowerCase(),
    baseRole: baseRole as (typeof users.baseRole.enumValues)[number],
    isAdmin,
    active: true,
  });

  revalidatePath("/settings/team");
}

export async function updateUser(userId: string, formData: FormData) {
  await requireAdmin();

  const baseRole = formData.get("baseRole");
  const isAdmin = formData.get("isAdmin") === "on";
  const active = formData.get("active") === "on";
  const schedulingLink = formData.get("schedulingLink");

  await db
    .update(users)
    .set({
      baseRole: baseRole as (typeof users.baseRole.enumValues)[number],
      isAdmin,
      active,
      schedulingLink:
        typeof schedulingLink === "string" && schedulingLink.trim().length
          ? schedulingLink.trim()
          : null,
    })
    .where(eq(users.id, userId));

  revalidatePath("/settings/team");
}

// Admins remove someone by deleting their row outright rather than a soft
// "removed" flag — deactivating (the existing Active checkbox) already
// covers "block their access but keep their deal history." A hard delete
// here is for invites that were never taken up, or anyone with truly no
// history; anyone with real records (deals, notes, uploads, etc.) is
// protected by foreign-key constraints, so we catch that and point the
// admin at deactivation instead of silently failing.
export async function deleteUser(userId: string) {
  const admin = await requireAdmin();

  if (admin.id === userId) {
    throw new Error("You can't delete your own account.");
  }

  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23503") {
      throw new Error(
        "Can't delete — this person has existing deals or records. Set them to inactive instead."
      );
    }
    throw err;
  }

  revalidatePath("/settings/team");
}

// Self-service: any signed-in user can set their own name, scheduling link,
// and email signature, but nothing else (role/admin/active stay admin-only
// via updateUser above). The profile page submits these from separate
// forms, so only touch a field if its form was the one actually submitted —
// otherwise saving one would null out the others.
export async function updateMyProfile(formData: FormData) {
  const user = await requireUser();
  const updates: Partial<typeof users.$inferInsert> = {};

  if (formData.has("name")) {
    const name = formData.get("name");
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Name is required");
    }
    updates.name = name.trim();
  }

  if (formData.has("schedulingLink")) {
    const schedulingLink = formData.get("schedulingLink");
    updates.schedulingLink =
      typeof schedulingLink === "string" && schedulingLink.trim().length
        ? schedulingLink.trim()
        : null;
  }

  if (formData.has("phone")) {
    const phone = formData.get("phone");
    updates.phone = typeof phone === "string" && phone.trim().length ? phone.trim() : null;
  }

  if (formData.has("nmlsNumber")) {
    const nmlsNumber = formData.get("nmlsNumber");
    updates.nmlsNumber = typeof nmlsNumber === "string" && nmlsNumber.trim().length ? nmlsNumber.trim() : null;
  }

  if (formData.has("emailSignatureHtml")) {
    const emailSignatureHtml = formData.get("emailSignatureHtml");
    updates.emailSignatureHtml =
      typeof emailSignatureHtml === "string" && emailSignatureHtml.trim().length
        ? emailSignatureHtml
        : null;
  }

  if (Object.keys(updates).length === 0) return;

  await db.update(users).set(updates).where(eq(users.id, user.id));

  revalidatePath("/settings");
}

// Final step of the first-login setup wizard — saves whatever the wizard
// collected and marks the person onboarded so the (app) layout stops
// redirecting them to /onboarding. Scheduling link is only sent for loan
// officers (the wizard skips that step for other roles), so it's left
// untouched, not nulled out, when absent.
export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const updates: Partial<typeof users.$inferInsert> = { onboardedAt: new Date() };

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name is required");
  }
  updates.name = name.trim();

  if (formData.has("schedulingLink")) {
    const schedulingLink = formData.get("schedulingLink");
    updates.schedulingLink =
      typeof schedulingLink === "string" && schedulingLink.trim().length
        ? schedulingLink.trim()
        : null;
  }

  const emailSignatureHtml = formData.get("emailSignatureHtml");
  updates.emailSignatureHtml =
    typeof emailSignatureHtml === "string" && emailSignatureHtml.trim().length ? emailSignatureHtml : null;

  await db.update(users).set(updates).where(eq(users.id, user.id));

  redirect("/pipeline");
}
