import { asc } from "drizzle-orm";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { phoneUnmatchedRouting } from "@/server/db/schema";
import { getTwilioSettings, getTcpaOutboundWindow } from "@/server/settings";
import { TCPA_ABSOLUTE_START, TCPA_ABSOLUTE_END } from "@/lib/tcpa";
import {
  updateTwilioSettings,
  disconnectTwilio,
  updateTcpaWindow,
  updateStageRouting,
  addUnmatchedRoutingUser,
  removeUnmatchedRoutingUser,
  moveUnmatchedRoutingUser,
} from "@/server/actions/phone-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { STAGES } from "@/lib/labels";

export default async function PhoneSettingsPage() {
  await requireAdmin();

  const [twilioSettings, tcpaWindow, stageRouting, unmatchedRouting, allUsers] = await Promise.all([
    getTwilioSettings(),
    getTcpaOutboundWindow(),
    db.query.phoneStageRouting.findMany(),
    db.query.phoneUnmatchedRouting.findMany({ with: { user: true }, orderBy: asc(phoneUnmatchedRouting.sortOrder) }),
    db.query.users.findMany({ where: (u, { eq }) => eq(u.active, true), orderBy: (u, { asc: ascU }) => ascU(u.name) }),
  ]);

  const connected = Boolean(twilioSettings);
  const roleByStage = new Map(stageRouting.map((r) => [r.stage, r.targetRole]));
  const webhookBase = `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks`;
  const availableForFallback = allUsers.filter((u) => !unmatchedRouting.some((r) => r.userId === u.id));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Twilio</CardTitle>
          <Badge variant={connected ? "success" : "secondary"}>{connected ? "Connected" : "Not connected"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Powers borrower texting and click-to-call — one shared company number for every deal.
          </p>
          <ActionForm action={updateTwilioSettings} successMessage="Twilio settings saved" className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="twilioAccountSid">Account SID</Label>
              <Input
                id="twilioAccountSid"
                name="twilioAccountSid"
                placeholder={connected ? "•••••••••••• (saved)" : "AC..."}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="twilioAuthToken">Auth token</Label>
              <Input
                id="twilioAuthToken"
                name="twilioAuthToken"
                type="password"
                placeholder={connected ? "•••••••••••• (saved)" : "Paste your auth token"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="twilioPhoneNumber">Company phone number</Label>
              <Input
                id="twilioPhoneNumber"
                name="twilioPhoneNumber"
                placeholder={twilioSettings?.phoneNumber ?? "+1..."}
              />
              <p className="text-xs text-muted-foreground">E.164 format, e.g. +15551234567.</p>
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>

          <div className="space-y-1.5 border-t pt-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Webhook URLs (set these on the number in Twilio's console)</p>
            <p>A message comes in: {webhookBase}/twilio-sms</p>
            <p>A call comes in: {webhookBase}/twilio-voice</p>
          </div>

          {connected && (
            <div className="flex justify-end border-t pt-4">
              <ActionForm
                action={disconnectTwilio}
                successMessage="Twilio disconnected"
                confirmMessage="Disconnect Twilio? Texting and calling will stop working until reconnected."
              >
                <SubmitButton variant="ghost" className="text-destructive hover:text-destructive">
                  Disconnect
                </SubmitButton>
              </ActionForm>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outbound calling/texting hours (TCPA)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The hard ceiling for any outbound call or text to a borrower — TCPA&apos;s &quot;reasonable hours&quot;
            guidance is based on the borrower&apos;s own local time, not staff. Each person&apos;s own hours (My
            Profile) can only narrow this window, never widen it. This window itself can&apos;t go wider than
            TCPA&apos;s own {TCPA_ABSOLUTE_START}–{TCPA_ABSOLUTE_END} safe harbor.
          </p>
          <ActionForm action={updateTcpaWindow} successMessage="Hours saved" className="max-w-sm space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="tcpaOutboundStart">Earliest</Label>
                <Input
                  id="tcpaOutboundStart"
                  name="tcpaOutboundStart"
                  type="time"
                  min={TCPA_ABSOLUTE_START}
                  max={TCPA_ABSOLUTE_END}
                  defaultValue={tcpaWindow?.start.slice(0, 5) ?? TCPA_ABSOLUTE_START}
                  required
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="tcpaOutboundEnd">Latest</Label>
                <Input
                  id="tcpaOutboundEnd"
                  name="tcpaOutboundEnd"
                  type="time"
                  min={TCPA_ABSOLUTE_START}
                  max={TCPA_ABSOLUTE_END}
                  defaultValue={tcpaWindow?.end.slice(0, 5) ?? TCPA_ABSOLUTE_END}
                  required
                />
              </div>
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbound call/text routing by stage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Which role a deal&apos;s inbound calls/texts go to, based on its current pipeline stage.
            &quot;Loan officer&quot; tries the assigned loan officer assistant first, escalating to the loan officer.
          </p>
          <ActionForm action={updateStageRouting} successMessage="Routing rules saved" className="space-y-3">
            <div className="space-y-2">
              {STAGES.map((stage) => (
                <div key={stage.value} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="text-sm">{stage.label}</span>
                  <Select name={`role_${stage.value}`} defaultValue={roleByStage.get(stage.value) ?? "loan_officer"}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loan_officer">Loan officer (+ assistant)</SelectItem>
                      <SelectItem value="processor">Processor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unmatched calls/texts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A call or text that doesn&apos;t match any deal at all (wrong number, or a brand-new lead) rings this
            list in order — everything lands in the Inbox either way.
          </p>
          <div className="space-y-1">
            {unmatchedRouting.map((row, i) => (
              <div key={row.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  {i + 1}. {row.user.name ?? row.user.email}
                </span>
                <div className="flex items-center gap-1">
                  <ActionForm action={moveUnmatchedRoutingUser.bind(null, row.id, "up")}>
                    <SubmitButton size="sm" variant="ghost" disabled={i === 0}>
                      Move up
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={moveUnmatchedRoutingUser.bind(null, row.id, "down")}>
                    <SubmitButton size="sm" variant="ghost" disabled={i === unmatchedRouting.length - 1}>
                      Move down
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={removeUnmatchedRoutingUser.bind(null, row.id)}>
                    <SubmitButton size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                      Remove
                    </SubmitButton>
                  </ActionForm>
                </div>
              </div>
            ))}
            {unmatchedRouting.length === 0 && <p className="text-sm text-muted-foreground">Nobody configured yet.</p>}
          </div>
          {availableForFallback.length > 0 && (
            <ActionForm action={addUnmatchedRoutingUser} successMessage="Added" className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="userId">Add to the list</Label>
                <Select name="userId">
                  <SelectTrigger id="userId" className="w-full">
                    <SelectValue placeholder="Select a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForFallback.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SubmitButton>Add</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
