import { auth } from "@/server/auth";
import { loadRoomState } from "@/server/team-chat-state";

// A chat's messages for the chat window. A plain request rather than a server action, because the browser runs
// server actions one at a time, and this one shouldn't wait behind the page's other background checks.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.active) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { markRead?: boolean };
  try {
    return Response.json(await loadRoomState(session.user, id, body.markRead === true), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Couldn't load that chat", { status: 403 });
  }
}
