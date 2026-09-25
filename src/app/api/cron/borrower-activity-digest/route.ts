import { sendBorrowerActivityDigests } from "@/server/borrower-activity";

// Vercel Cron calls this on the schedule in vercel.json, sending
// `Authorization: Bearer $CRON_SECRET`. Anything else is rejected.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendBorrowerActivityDigests();
  return Response.json(result);
}
