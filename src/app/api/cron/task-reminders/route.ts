import { sendTaskDayDigests, sendTaskReminderPushes } from "@/server/tasks";

export const maxDuration = 30;

// Every 5 minutes: a phone push for a task that came due (or is 15 minutes away, for people who chose that) without
// the on-screen pop-up reaching anyone first. Also, once a morning, the "tasks due today / overdue" summary.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const pushes = await sendTaskReminderPushes();
  return Response.json({ ...pushes, digests: await sendTaskDayDigests() });
}
