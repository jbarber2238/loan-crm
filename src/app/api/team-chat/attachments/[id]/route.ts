import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { teamChatAttachments, teamChatMessages } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { roomAccess } from "@/server/team-chat-access";

// Serves a chat attachment only to people who can open that chat's room.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.active) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select({
      fileName: teamChatAttachments.fileName,
      mimeType: teamChatAttachments.mimeType,
      data: teamChatAttachments.data,
      roomId: teamChatMessages.roomId,
    })
    .from(teamChatAttachments)
    .innerJoin(teamChatMessages, eq(teamChatMessages.id, teamChatAttachments.messageId))
    .where(eq(teamChatAttachments.id, id));
  if (!row) return new Response("Not found", { status: 404 });

  const { allowed } = await roomAccess(row.roomId, { id: session.user.id, isAdmin: session.user.isAdmin });
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const safeName = row.fileName.replace(/["\r\n]/g, "");
  const inline = /^(image|audio)\//.test(row.mimeType) || row.mimeType === "application/pdf";
  return new Response(Buffer.from(row.data, "base64"), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
