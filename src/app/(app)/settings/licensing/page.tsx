import { requireAdmin } from "@/server/auth/guards";
import { getLicensingConfig } from "@/server/licensing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LicenseStatesEditor, LicensingDetailsForm } from "@/components/settings/licensing-controls";

export default async function LicensingSettingsPage() {
  await requireAdmin();
  const config = await getLicensingConfig();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Some states require a license to close a deal. When a deal comes in from one, it&apos;s flagged on the deal, on the pipeline and
        in your alerts, so you know to close it under a licensed broker and plan your compensation.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your license and your licensed broker</CardTitle>
        </CardHeader>
        <CardContent>
          <LicensingDetailsForm nmlsId={config.nmlsId} broker={config.broker} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">States that require a license to close</CardTitle>
          <p className="text-xs text-muted-foreground">
            Add a state when its rules change, and remove one when it no longer applies. Changes apply to every deal right away.
          </p>
        </CardHeader>
        <CardContent>
          <LicenseStatesEditor states={config.states} />
        </CardContent>
      </Card>
    </div>
  );
}
