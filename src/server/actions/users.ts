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
  const assignedSelections = formData
    .getAll("assignedLoanOfficerIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const assignedLoanOfficerIds = assignedSelections.length ? assignedSelections : null;

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
      assignedLoanOfficerIds,
    })
    .where(eq(users.id, userId));

  revalidatePath("/settings/team");
}

// Self-service: any signed-in user can set their own scheduling link, but
// nothing else (role/admin/active stay admin-only via updateUser above).
export async function updateMyProfile(formData: FormData) {
  const user = await requireUser();
  const schedulingLink = formData.get("schedulingLink");

  await db
    .update(users)
    .set({
      schedulingLink:
        typeof schedulingLink === "string" && schedulingLink.trim().length
          ? schedulingLink.trim()
          : null,
    })
    .where(eq(users.id, user.id));

  revalidatePath("/settings");
}
