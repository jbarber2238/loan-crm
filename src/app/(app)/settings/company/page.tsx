import { requireAdmin } from "@/server/auth/guards";
import { getCompanyName, getDscrCalculatorLink } from "@/server/settings";
import { updateCompanyName, updateDscrCalculatorLink } from "@/server/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function CompanySettingsPage() {
  await requireAdmin();
  const companyName = await getCompanyName();
  const dscrCalculatorLink = await getDscrCalculatorLink();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateCompanyName} className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Company Name</Label>
              <Input id="name" name="name" defaultValue={companyName} required />
              <p className="text-xs text-muted-foreground">
                Used in email templates, PDF term sheets, and throughout the app.
              </p>
            </div>
            <Button type="submit">Save Changes</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DSCR Calculator Link</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateDscrCalculatorLink} className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dscrCalculatorLink">Link</Label>
              <Input
                id="dscrCalculatorLink"
                name="dscrCalculatorLink"
                defaultValue={dscrCalculatorLink ?? ""}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Included as a P.S. in the DSCR &ldquo;term sheet ready&rdquo; email to borrowers.
              </p>
            </div>
            <Button type="submit">Save Changes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
