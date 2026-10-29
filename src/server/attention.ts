import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";

/**
 * How many things are waiting on a person: unread notifications plus unread team-chat messages in the rooms they
 * can see (General, their group and direct chats, and deal chats they're on; admins see every deal chat). This one
 * number is what the browser tab, the home-screen icon and a push notification all show.
 */
export async function attentionCountFor(user: { id: string; isAdmin: boolean }): Promise<number> {
  const [notif] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  const rows = await db.execute(sql`
    select count(*)::int as n
    from team_chat_messages m
    join team_chat_rooms r on r.id = m.room_id
    left join deals d on d.id = r.deal_id
    left join team_chat_reads rd on rd.room_id = m.room_id and rd.user_id = ${user.id}
    where m.user_id <> ${user.id}
      and (rd.last_read_at is null or m.created_at > rd.last_read_at)
      and (
        r.kind = 'general'
        or (r.kind in ('group', 'dm') and exists (select 1 from team_chat_members tm where tm.room_id = r.id and tm.user_id = ${user.id}))
        or (r.kind = 'deal' and (
          ${user.isAdmin}
          or ${user.id} in (d.assigned_loan_officer_id, d.assigned_processor_id, d.assigned_assistant_id)
          or exists (select 1 from team_chat_members tm where tm.room_id = r.id and tm.user_id = ${user.id})
        ))
      )
  `);
  const chat = Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
  return (notif?.n ?? 0) + chat;
}
