import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { marketingCampaigns } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { loadAllPeople } from "@/server/marketing-audience";
import { sender } from "@/server/friday";
import { loadCapSnapshot } from "@/server/send-limits";
import { getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { CampaignBuilder } from "@/components/marketing/campaign-builder";
import { audienceOptions } from "@/lib/marketing-audience";
import { parseSchedule } from "@/lib/campaign-schedule";
import { EMPTY_DRAFT, type CampaignDraft, type ChatMessage } from "@/lib/campaign-draft";

export const dynamic = "force-dynamic";

function readChat(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m) =>
    m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" ? [{ role: m.role as ChatMessage["role"], content: m.content }] : []
  );
}

export default async function EmailBuilderPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireAdmin();
  const { c } = await searchParams;
  const uuid = c && /^[0-9a-f-]{36}$/i.test(c) ? c : null;
  const [people, row, from, logoHtml] = await Promise.all([
    loadAllPeople(),
    uuid ? db.query.marketingCampaigns.findFirst({ where: eq(marketingCampaigns.id, uuid) }) : Promise.resolve(undefined),
    sender(),
    getCompanyLogoHtml(),
  ]);
  const signatureHtml = from ? await getUserEmailSignatureHtml(from.id) : "";
  const snapshot = from ? await loadCapSnapshot(from.id) : null;
  const draft: CampaignDraft = row
    ? {
        name: row.name,
        subject: row.subject,
        body: row.body,
        audienceKey: row.audienceKey,
        funnel: row.funnel,
        tagRecipients: row.tagRecipients,
        schedule: parseSchedule(row.schedule) ?? { mode: "draft" },
        skipPreviousRecipients: row.skipPreviousRecipients,
      }
    : EMPTY_DRAFT;
  return (
    <CampaignBuilder
      key={row?.id ?? "new"}
      campaignId={row?.id ?? null}
      status={row?.status ?? "new"}
      initialDraft={draft}
      initialChat={readChat(row?.chat)}
      audiences={audienceOptions(people)}
      logoHtml={logoHtml}
      signatureHtml={signatureHtml}
      aiReady={Boolean(process.env.ANTHROPIC_API_KEY)}
      cap={snapshot ? { used24h: snapshot.used24h, dailyLimit: snapshot.dailyLimit, campaignUsed24h: snapshot.campaignUsed24h, campaignDailyMax: snapshot.campaignDailyMax } : null}
    />
  );
}
