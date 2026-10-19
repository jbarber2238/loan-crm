import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads } from "@/server/db/schema";
import { buildIcs, nextSessionDay } from "@/lib/friday-schedule";

// The .ics download on the confirmation screen. The lead id in the URL is the
// only thing identifying the person, and it only ever reveals their own session link.
export async function GET(_request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return new Response("Not found", { status: 404 });
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { id: true, zoomJoinUrl: true, fridayBookedSessionDate: true },
  });
  if (!lead) return new Response("Not found", { status: 404 });
  const day = lead.fridayBookedSessionDate ?? nextSessionDay(new Date());
  const ics = buildIcs({ uid: lead.id, day, joinUrl: lead.zoomJoinUrl ?? "https://mannalendingco.com/friday" });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="See-It-Send-It-Get-Paid.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
