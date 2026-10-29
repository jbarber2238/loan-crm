import { requireAdmin } from "@/server/auth/guards";
import { loadFollowUps } from "@/server/follow-ups";
import { FollowUpAssistant } from "@/components/marketing/follow-up-assistant";

export const dynamic = "force-dynamic";

export default async function FollowUpPage() {
  await requireAdmin();
  const contacts = await loadFollowUps();
  return <FollowUpAssistant contacts={contacts} nowIso={new Date().toISOString()} />;
}
