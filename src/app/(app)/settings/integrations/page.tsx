import { requireAdmin } from "@/server/auth/guards";
import { getPandaDocApiKey, getPandaDocWebhookSharedKey } from "@/server/settings";
import { updatePandaDocSettings, disconnectPandaDoc } from "@/server/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default async function IntegrationsSettingsPage() {
  await requireAdmin();
  const [apiKey, webhookSharedKey] = await Promise.all([getPandaDocApiKey(), getPandaDocWebhookSharedKey()]);
  const connected = Boolean(apiKey);
  const webhookUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/webhooks/pandadoc`;

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

          <form action={updatePandaDocSettings} className="max-w-sm space-y-4">
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
            <Button type="submit">Save</Button>
          </form>

          {connected && (
            <form action={disconnectPandaDoc}>
              <ConfirmSubmitButton
                type="submit"
                variant="destructive"
                size="sm"
                confirmMessage="Disconnect PandaDoc? Any PandaDoc Form needs already sent to borrowers will stop being able to reach PandaDoc until you reconnect."
              >
                Disconnect
              </ConfirmSubmitButton>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">More integrations (e.g. SMS) will show up here as they&apos;re added.</p>
    </div>
  );
}
