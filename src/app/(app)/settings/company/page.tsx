import { requireAdmin } from "@/server/auth/guards";
import { getCompanyName, getCompanyLogoFileName, getCompanyLogo, getCompanyWireInstructions, getPortalBranding, getResourceLinks } from "@/server/settings";
import { PortalBrandingCard } from "@/components/settings/portal-branding-card";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { isNotNull } from "drizzle-orm";
import { updateCompanyName, updateCompanyLogo, removeCompanyLogo, updateCompanyWireInstructions, removeCompanyWireInstructions, updateResourceLink, deleteResourceLink, moveResourceLink } from "@/server/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AddResourceLinkForm } from "@/components/settings/add-resource-link-form";

export default async function CompanySettingsPage() {
  await requireAdmin();
  const companyName = await getCompanyName();
  const [logoFileName, logo, wire, branding, resources] = await Promise.all([
    getCompanyLogoFileName(),
    getCompanyLogo(),
    getCompanyWireInstructions(),
    getPortalBranding(),
    getResourceLinks(),
  ]);
  // "Open full portal" shows a real borrower link: the newest deal that has one.
  const sampleDeal = await db.query.deals.findFirst({
    where: isNotNull(deals.borrowerUploadToken),
    columns: { borrowerUploadToken: true },
    orderBy: (d, { desc }) => desc(d.createdAt),
  });

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
            Shown at the top of every outgoing email — pricing requests to lenders and borrower emails alike — in the CRM sidebar, and on your borrower upload link.
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

      <PortalBrandingCard
        configured={Boolean(branding.headerColor && branding.accentColor)}
        initialHeader={branding.headerColor}
        initialAccent={branding.accentColor}
        initialButton={branding.buttonColor}
        initialPalette={branding.palette}
        logoSrc={logo?.src ?? null}
        companyName={companyName}
        previewHref={sampleDeal?.borrowerUploadToken ? `/borrower-upload/${sampleDeal.borrowerUploadToken}` : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>Wire Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The company&apos;s wire instructions. Every team member, processors included, can open them from My Profile, so nobody has to ask for them.
          </p>
          {wire && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <a href="/api/company-wire-instructions" target="_blank" rel="noreferrer" className="text-sm font-medium underline underline-offset-2">
                {wire.fileName}
              </a>
              {wire.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Uploaded {wire.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
              <ActionForm action={removeCompanyWireInstructions} successMessage="Wire instructions removed" confirmMessage="Remove the wire instructions? Your team won't be able to open them until you upload a new file." className="ml-auto">
                <SubmitButton size="sm" variant="ghost">
                  Remove
                </SubmitButton>
              </ActionForm>
            </div>
          )}
          <ActionForm action={updateCompanyWireInstructions} successMessage="Wire instructions saved" className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wire">{wire ? "Replace wire instructions" : "Upload wire instructions"}</Label>
              <Input id="wire" name="wire" type="file" accept="application/pdf,image/*,.doc,.docx" />
              <p className="text-xs text-muted-foreground">PDF or image, up to 15MB. Only admins can upload or change it.</p>
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Links your team can open from My Profile, such as a Google Drive document. You name each one; they click the name to open it. Make sure the Drive document is shared with your team.
          </p>
          {resources.map((r, i) => (
            <div key={r.id} className="space-y-2 rounded-md border p-3">
              <ActionForm action={updateResourceLink} successMessage="Link saved" className="grid gap-2 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end">
                <input type="hidden" name="id" value={r.id} />
                <div className="space-y-1.5">
                  <Label htmlFor={`resource-title-${r.id}`}>Name</Label>
                  <Input id={`resource-title-${r.id}`} name="title" defaultValue={r.title} maxLength={120} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`resource-url-${r.id}`}>Link</Label>
                  <Input id={`resource-url-${r.id}`} name="url" defaultValue={r.url} required />
                </div>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
              <div className="flex flex-wrap items-center gap-1">
                <ActionForm action={moveResourceLink}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="direction" value="up" />
                  <SubmitButton size="sm" variant="ghost" disabled={i === 0} aria-label={`Move ${r.title} up`}>
                    <ArrowUp className="size-4" />
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={moveResourceLink}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="direction" value="down" />
                  <SubmitButton size="sm" variant="ghost" disabled={i === resources.length - 1} aria-label={`Move ${r.title} down`}>
                    <ArrowDown className="size-4" />
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={deleteResourceLink} successMessage="Link removed" confirmMessage={`Remove "${r.title}"? Your team won't see it on My Profile anymore.`} className="ml-auto">
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="ghost">
                    Remove
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          ))}
          <AddResourceLinkForm hasLinks={resources.length > 0} />
        </CardContent>
      </Card>
    </div>
  );
}
