import { requireAdmin } from "@/server/auth/guards";
import { getCompanyName, getCompanyLogoFileName, getCompanyLogo } from "@/server/settings";
import { updateCompanyName, updateCompanyLogo, removeCompanyLogo } from "@/server/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

export default async function CompanySettingsPage() {
  await requireAdmin();
  const companyName = await getCompanyName();
  const [logoFileName, logo] = await Promise.all([getCompanyLogoFileName(), getCompanyLogo()]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateCompanyName} successMessage="Company name saved" className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Company Name</Label>
              <Input id="name" name="name" defaultValue={companyName} required />
              <p className="text-xs text-muted-foreground">
                Used in email templates, PDF term sheets, and throughout the app.
              </p>
            </div>
            <SubmitButton>Save Changes</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Shown at the top of every outgoing email — pricing requests to lenders and borrower emails alike.
          </p>
          {logoFileName && logo && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <div className={logo.isLight ? "rounded-md bg-[#111318] p-2" : ""}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.src} alt="Company logo" className="h-12 w-auto object-contain" />
              </div>
              <span className="text-sm text-muted-foreground">{logoFileName}</span>
              <ActionForm action={removeCompanyLogo} successMessage="Logo removed" className="ml-auto">
                <SubmitButton size="sm" variant="ghost">
                  Remove
                </SubmitButton>
              </ActionForm>
            </div>
          )}
          <ActionForm action={updateCompanyLogo} successMessage="Logo saved" className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="logo">{logoFileName ? "Replace logo" : "Upload logo"}</Label>
              <Input id="logo" name="logo" type="file" accept="image/*" />
              <p className="text-xs text-muted-foreground">PNG or JPG, up to 2MB.</p>
            </div>
            <SubmitButton>Save Changes</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
