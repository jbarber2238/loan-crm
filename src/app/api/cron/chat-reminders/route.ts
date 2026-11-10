import { remindUnreadChats } from "@/server/chat-reminders";

export const maxDuration = 30;

// Every 5 minutes: one push reminder for a direct message or tag that is still unread after 10 minutes.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await remindUnreadChats());
}
