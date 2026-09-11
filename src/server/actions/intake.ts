"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createDealFromIntake } from "@/server/actions/deals";

export async function submitPublicIntake(loanOfficerId: string, formData: FormData) {
  const loanOfficer = await db.query.users.findFirst({
    where: eq(users.id, loanOfficerId),
  });
  if (!loanOfficer || !loanOfficer.active) {
    throw new Error("This intake link is no longer active.");
  }

  await createDealFromIntake(formData, {
    assignedLoanOfficerId: loanOfficerId,
    assignedProcessorId: null,
    assignedAssistantId: null,
    driveLink: null,
    noteAuthorUserId: null,
    stageChangedByUserId: loanOfficerId,
  });

  redirect(`/intake/${loanOfficerId}?submitted=1`);
}
