import { getEligibilitySummary, loadEligiblePeople, loadSavedAudiences } from "@/server/marketing-audience";
import { AudienceExplorer } from "@/components/marketing/audience-explorer";

export default async function AudiencesPage() {
  const people = await loadEligiblePeople();
  const [summary, saved] = await Promise.all([getEligibilitySummary(people.length), loadSavedAudiences()]);
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Pick exactly who a campaign goes to. Only people who agreed to marketing emails and haven&apos;t unsubscribed can ever appear here. Every person carries tags:
        some are worked out for you (where they came from, their role, Friday attendance, partner status) and some you add yourself.
      </p>
      <AudienceExplorer people={people} summary={summary} saved={saved} />
    </div>
  );
}
