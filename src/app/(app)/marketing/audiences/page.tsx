import { requireAdmin } from "@/server/auth/guards";
import { loadAllPeople } from "@/server/marketing-audience";
import { audienceOptions } from "@/lib/marketing-audience";
import { AudienceExplorer } from "@/components/marketing/audience-explorer";

export default async function AudiencesPage({ searchParams }: { searchParams: Promise<{ audience?: string }> }) {
  await requireAdmin();
  const { audience } = await searchParams;
  const people = await loadAllPeople();
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Pick a list to see exactly who is on it. Only people who agreed to marketing emails (and haven&apos;t unsubscribed) can be emailed. Borrowers and partners show up here too: record who has told you
        they&apos;re OK with it and they join the list.
      </p>
      <AudienceExplorer people={people} options={audienceOptions(people)} initialKey={audience ?? "all"} />
    </div>
  );
}
