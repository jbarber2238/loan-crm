"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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

// Self-service: any signed-in user can set their own scheduling link and
// email signature, but nothing else (role/admin/active stay admin-only via
// updateUser above). The profile page submits these from two separate
// forms, so only touch a field if its form was the one actually submitted —
// otherwise saving one would null out the other.
export async function updateMyProfile(formData: FormData) {
  const user = await requireUser();
  const updates: Partial<typeof users.$inferInsert> = {};

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
