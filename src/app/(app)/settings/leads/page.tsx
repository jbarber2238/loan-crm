import { getLeadMagnetSubmissions } from "@/server/actions/lead-magnet";
import { LeadMagnetSubmissionsView } from "@/components/settings/lead-magnet-submissions-view";

export default async function LeadsSettingsPage() {
  const submissions = await getLeadMagnetSubmissions();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Everyone who&apos;s unlocked a gated tool on the marketing site (like the Max Allowable Offer Calculator) by
        giving their name, phone, and email.
      </p>
      <LeadMagnetSubmissionsView submissions={submissions} />
    </div>
  );
}
