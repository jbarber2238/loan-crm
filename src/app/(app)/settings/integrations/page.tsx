import { requireAdmin } from "@/server/auth/guards";
import { getPandaDocApiKey, getPandaDocWebhookSharedKey, getStripeSecretKey, getStripeWebhookSecret } from "@/server/settings";
import { updatePandaDocSettings, disconnectPandaDoc, updateStripeSettings, disconnectStripe } from "@/server/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

export default async function IntegrationsSettingsPage() {
  await requireAdmin();
  const [apiKey, webhookSharedKey, stripeSecretKey, stripeWebhookSecret] = await Promise.all([
    getPandaDocApiKey(),
    getPandaDocWebhookSharedKey(),
    getStripeSecretKey(),
    getStripeWebhookSecret(),
  ]);
  const connected = Boolean(apiKey);
  const stripeConnected = Boolean(stripeSecretKey);
  const webhookUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/pandadoc`;
  const stripeWebhookUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/stripe`;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <p className="font-medium text-sm">Google Workspace</p>
              <p className="text-xs text-muted-foreground">
                Each loan officer connects their own Gmail send access when they sign in.
              </p>
            </div>
            <Badge>Built in</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>PandaDoc</CardTitle>
          <Badge variant={connected ? "success" : "secondary"}>{connected ? "Connected" : "Not connected"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Powers &quot;PandaDoc Form&quot; client needs — a lender&apos;s own application PDF, filled and signed by
            the borrower from their upload page.
          </p>

          <ActionForm action={updatePandaDocSettings} successMessage="PandaDoc settings saved" className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API key</Label>
              <Input id="apiKey" name="apiKey" type="password" placeholder={apiKey ? "•••••••••••• (saved)" : "Paste your API key"} />
              <p className="text-xs text-muted-foreground">From PandaDoc&apos;s Developer Dashboard → API Keys.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="webhookSharedKey">Webhook shared key</Label>
              <Input
                id="webhookSharedKey"
                name="webhookSharedKey"
                type="password"
                placeholder={webhookSharedKey ? "•••••••••••• (saved)" : "Paste the shared key"}
              />
              <p className="text-xs text-muted-foreground">
                Issued when you create a webhook subscription pointing at{" "}
                <code className="rounded bg-muted px-1 py-0.5">{webhookUrl}</code> — used to confirm webhook
                deliveries really came from PandaDoc.
              </p>
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>

          {connected && (
            <ActionForm
              action={disconnectPandaDoc}
              successMessage="PandaDoc disconnected"
              confirmMessage="Disconnect PandaDoc? Any PandaDoc Form needs already sent to borrowers will stop being able to reach PandaDoc until you reconnect."
            >
              <SubmitButton variant="destructive" size="sm">
                Disconnect
              </SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Stripe</CardTitle>
          <Badge variant={stripeConnected ? "success" : "secondary"}>{stripeConnected ? "Connected" : "Not connected"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Auto-generates and sends the $999 processing-fee invoice the moment a borrower signs their accepted
            term sheet. This is separate from any Stripe access used elsewhere — the app needs its own key to run
            this in production.
          </p>

          <ActionForm action={updateStripeSettings} successMessage="Stripe settings saved" className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="secretKey">Secret key</Label>
              <Input
                id="secretKey"
                name="secretKey"
                type="password"
                placeholder={stripeSecretKey ? "•••••••••••• (saved)" : "sk_live_..."}
              />
              <p className="text-xs text-muted-foreground">From Stripe&apos;s Dashboard → Developers → API keys.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="webhookSecret">Webhook signing secret</Label>
              <Input
                id="webhookSecret"
                name="webhookSecret"
                type="password"
                placeholder={stripeWebhookSecret ? "•••••••••••• (saved)" : "whsec_..."}
              />
              <p className="text-xs text-muted-foreground">
                Issued when you add a webhook endpoint pointing at{" "}
                <code className="rounded bg-muted px-1 py-0.5">{stripeWebhookUrl}</code> listening for the{" "}
                <code className="rounded bg-muted px-1 py-0.5">invoice.paid</code> event.
              </p>
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>

          {stripeConnected && (
            <ActionForm
              action={disconnectStripe}
              successMessage="Stripe disconnected"
              confirmMessage="Disconnect Stripe? Processing-fee invoices will stop being generated automatically until you reconnect."
            >
              <SubmitButton variant="destructive" size="sm">
                Disconnect
              </SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">More integrations (e.g. SMS) will show up here as they&apos;re added.</p>
    </div>
  );
}
