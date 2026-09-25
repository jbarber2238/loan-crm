import { auth } from "@/server/auth";
import { notifyProcessorOfPaidDeal } from "@/server/deal-notifications";

// TEMPORARY — one-off test send, removed right after use.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !session.user.isAdmin) return new Response("Unauthorized", { status: 401 });
  await notifyProcessorOfPaidDeal("76c3886c-bb6d-4869-86d1-c2fd969dda13", session.user.email);
  return new Response(`sent to ${session.user.email}`);
}
