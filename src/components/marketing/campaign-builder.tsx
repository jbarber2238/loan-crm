"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mic, MicOff, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampaignScheduleEditor } from "@/components/marketing/campaign-schedule-editor";
import { SELECT_CLASS } from "@/components/marketing/form-classes";
import { chatWithBuilder, saveCampaign, sendTestEmail, startCampaign } from "@/server/actions/marketing-campaigns";
import { CAMPAIGN_BUTTONS, FUNNELS, campaignTags, renderCampaign, unknownTokens } from "@/lib/campaign-email";
import { describeSchedule } from "@/lib/campaign-schedule";
import { draftGaps, type CampaignDraft, type ChatMessage } from "@/lib/campaign-draft";
import { marketingEmailFooter } from "@/lib/lead-email-footer";
import type { AudienceOption } from "@/lib/marketing-audience";
import { projectSend, type SendLimitsInput } from "@/lib/send-limits";

type UiMessage = ChatMessage & { changes?: string[] };

const STARTERS = [
  "Invite everyone who hasn't signed up as a partner to this Friday's Zoom",
  "Check in with borrowers who closed a loan with us and ask who they know that needs financing",
  "Follow up with people who used the calculator but haven't applied",
];

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

export function CampaignBuilder({
  campaignId: initialId,
  status,
  initialDraft,
  initialChat,
  audiences,
  logoHtml,
  signatureHtml,
  aiReady,
  cap,
  setupIssues,
}: {
  campaignId: string | null;
  status: string;
  initialDraft: CampaignDraft;
  initialChat: ChatMessage[];
  audiences: AudienceOption[];
  logoHtml: string;
  signatureHtml: string;
  aiReady: boolean;
  cap: SendLimitsInput | null;
  setupIssues: string[];
}) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [draft, setDraft] = useState(initialDraft);
  const [messages, setMessages] = useState<UiMessage[]>(initialChat);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const recognition = useRef<Recognition | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const live = status === "active" || status === "paused" || status === "completed";

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages, thinking]);

  const update = (patch: Partial<CampaignDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const audience = audiences.find((a) => a.key === draft.audienceKey);
  const groups = useMemo(() => [...new Set(audiences.map((a) => a.group))], [audiences]);
  const gaps = draftGaps(draft);
  const unknown = unknownTokens(`${draft.subject}\n${draft.body}`);
  const tags = campaignTags(draft.name || "untitled", draft.tagRecipients);
  const plainChat = (list: UiMessage[]): ChatMessage[] => list.map(({ role, content }) => ({ role, content }));

  const preview = useMemo(
    () =>
      renderCampaign(
        {
          subject: draft.subject || "Your subject line",
          body: draft.body || "Your email will appear here as soon as we've talked it through.",
          name: "Alex Morgan",
        },
        (key) => CAMPAIGN_BUTTONS[key]?.path ?? "#"
      ),
    [draft.subject, draft.body]
  );

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    const history: UiMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setThinking(true);
    const r = await chatWithBuilder(plainChat(history), draft);
    setThinking(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setDraft(r.draft);
    setDirty(true);
    setMessages([...history, { role: "assistant", content: r.reply, changes: r.changes }]);
  }

  function toggleMic() {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Voice typing isn't available in this browser. Try Chrome or Safari, or use your Mac's dictation.");
      return;
    }
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      const said = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said) setInput((prev) => `${prev ? `${prev} ` : ""}${said}`);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  function save(then?: () => void) {
    startTransition(async () => {
      const r = await saveCampaign(id, draft, plainChat(messages));
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setId(r.id);
      setDirty(false);
      if (!id) router.replace(`/marketing?c=${r.id}`);
      toast.success(live ? "Changes saved" : "Draft saved");
      then?.();
    });
  }

  function start() {
    startTransition(async () => {
      const r = await startCampaign(id, draft, plainChat(messages));
      setConfirming(false);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Started. ${r.recipients} ${r.recipients === 1 ? "person" : "people"} will get it.`);
      router.push("/marketing/campaigns");
    });
  }

  function test() {
    startTransition(async () => {
      const r = await sendTestEmail(draft);
      if ("error" in r) toast.error(r.error);
      else toast.success(`Test sent to ${r.to}`);
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      {setupIssues.length > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>Setup still to do before sending campaigns:</strong> {setupIssues.join(", ")} {setupIssues.length === 1 ? "needs" : "need"} fixing, or your emails are likely to land in spam. Bounces also have to be
          marked by hand until we connect an email service.{" "}
          <Link href="/marketing/email-log" className="underline">
            See what to fix
          </Link>
        </p>
      )}
      {live && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          This campaign is <strong>{status}</strong>. Changes you save apply to emails that haven&apos;t gone out yet.{" "}
          <Link href="/marketing/campaigns" className="underline">
            Back to campaigns
          </Link>
        </p>
      )}

      {/* 1. Talk it through */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Tell me about the campaign</h2>
        </div>
        {!aiReady && <p className="text-sm text-destructive">The AI isn&apos;t connected (no API key), so this chat can&apos;t answer. You can still write the email by hand below.</p>}
        <div className="max-h-96 space-y-3 overflow-y-auto rounded-md bg-muted/30 p-3" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type or speak what you want to do: who it&apos;s for, what you want them to do, and when. I&apos;ll ask if I need more, then write the email and set up the audience and schedule below for you
                to review. Nothing is sent until you press Start.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} type="button" disabled={!aiReady} onClick={() => send(s)} className="rounded-full border bg-background px-3 py-1 text-left text-xs hover:bg-muted disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-10 rounded-lg bg-primary/10 px-3 py-2 text-sm" : "mr-10 space-y-2 rounded-lg border bg-background px-3 py-2 text-sm"}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.changes && m.changes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {m.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {thinking && <p className="mr-10 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">Working on it…</p>}
          <div ref={chatEnd} />
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            rows={2}
            className="min-h-0 flex-1"
            placeholder={listening ? "Listening…" : "Describe the campaign, or answer my question"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={!aiReady}
          />
          <Button type="button" variant={listening ? "destructive" : "outline"} size="icon" aria-label={listening ? "Stop listening" : "Speak instead of typing"} onClick={toggleMic} disabled={!aiReady}>
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Button type="submit" disabled={!aiReady || thinking || !input.trim()}>
            <Send className="size-4" /> Send
          </Button>
        </form>
      </section>

      {/* 2. The email */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">The email</h2>
          <Button variant="outline" size="sm" disabled={pending || !draft.subject || !draft.body} onClick={test}>
            Send me a test
          </Button>
        </div>
        <div className="rounded-lg border bg-white p-5 text-[#1f2937] shadow-sm" style={{ colorScheme: "light" }}>
          <div className="mb-4 space-y-0.5 border-b pb-3 text-xs text-gray-500">
            <div>To: Alex Morgan (an example name)</div>
            <div className="text-sm font-semibold text-gray-900">{preview.subject}</div>
          </div>
          <div dangerouslySetInnerHTML={{ __html: logoHtml + preview.html + signatureHtml + marketingEmailFooter("#") }} />
        </div>
        {unknown.length > 0 && <p className="text-sm text-destructive">These aren&apos;t real merge fields or buttons and would show up as typed: {unknown.map((t) => `{{${t}}}`).join(", ")}.</p>}
        <details className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Edit the words yourself</summary>
          <div className="space-y-3 border-t p-3">
            <div className="space-y-1.5">
              <Label htmlFor="cb-subject">Subject line</Label>
              <Input id="cb-subject" value={draft.subject} onChange={(e) => update({ subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cb-body">Email</Label>
              <Textarea id="cb-body" rows={12} value={draft.body} onChange={(e) => update({ body: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                Merge fields: {"{{firstName}}"}, {"{{name}}"}. Buttons, each on its own line: {Object.keys(CAMPAIGN_BUTTONS).map((k) => `{{${k}}}`).join(", ")}. Your signature and the unsubscribe footer are added
                automatically.
              </p>
            </div>
          </div>
        </details>
      </section>

      {/* 3. Audience */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">Who gets it</h2>
        <div className="space-y-1.5">
          <Label htmlFor="cb-audience">Audience</Label>
          <select id="cb-audience" className={SELECT_CLASS} value={draft.audienceKey} onChange={(e) => update({ audienceKey: e.target.value })}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {audiences
                  .filter((a) => a.group === g)
                  .map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label} ({a.eligible})
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        {audience && (
          <p className="text-sm">
            <strong className="text-base tabular-nums">{audience.eligible}</strong> {audience.eligible === 1 ? "person" : "people"} will get this.{" "}
            {audience.notAgreed > 0 && (
              <span className="text-muted-foreground">
                {audience.notAgreed} more in this group haven&apos;t agreed to marketing, so they won&apos;t.{" "}
                <Link href={`/marketing/audiences?audience=${encodeURIComponent(audience.key)}`} className="underline">
                  Record who has
                </Link>
              </span>
            )}
            {audience.notAgreed === 0 && (
              <Link href={`/marketing/audiences?audience=${encodeURIComponent(audience.key)}`} className="text-muted-foreground underline">
                See exactly who
              </Link>
            )}
          </p>
        )}
      </section>

      {/* 4. Settings */}
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-base font-semibold">Campaign settings</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cb-name">Campaign name</Label>
            <Input id="cb-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Friday Zoom invite, October" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb-funnel">Linked to</Label>
            <select id="cb-funnel" className={SELECT_CLASS} value={draft.funnel ?? ""} onChange={(e) => update({ funnel: e.target.value || null })}>
              <option value="">Nothing in particular</option>
              {FUNNELS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cb-tag">Tag for everyone who gets it</Label>
            <Input id="cb-tag" value={draft.tagRecipients ?? ""} placeholder={tags.sent} onChange={(e) => update({ tagRecipients: e.target.value.trim() ? e.target.value : null })} />
            <p className="text-xs text-muted-foreground">
              Everyone it&apos;s sent to gets the tag “{tags.sent}”, and anyone who clicks a button in it gets “{tags.clicked}”. Use those tags as audiences later.
              {draft.funnel && ` The button for ${FUNNELS.find((f) => f.value === draft.funnel)?.label} (${CAMPAIGN_BUTTONS[FUNNELS.find((f) => f.value === draft.funnel)!.buttonKey].label}) sends them to the right page.`}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>When it goes out</Label>
          <CampaignScheduleEditor schedule={draft.schedule} onChange={(schedule) => update({ schedule })} />
        </div>
        {draft.schedule.mode === "repeat" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={draft.skipPreviousRecipients} onChange={(e) => update({ skipPreviousRecipients: e.target.checked })} />
            <span>Don&apos;t send it again to anyone who already got it. Each run only goes to people who are new to the audience.</span>
          </label>
        )}
      </section>

      <details className="rounded-lg border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">What I can set up here, and what needs Claude Code</summary>
        <div className="grid gap-4 border-t p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 font-medium">I can do this from here</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Write the email and subject, with merge fields and buttons</li>
              <li>Pick the audience: a group, a funnel, a tag or borrowers</li>
              <li>Send now, once at a time, or on a repeat, with an end date or limit</li>
              <li>Tag everyone who gets it, and anyone who clicks, so you can target them next</li>
              <li>Link it to the Friday Zoom, the calculators, the partner program or the loan application</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">This still has to be built in Claude Code</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>New landing pages or forms</li>
              <li>A multi-email drip sequence that follows each person (for now, each email is its own campaign)</li>
              <li>Open tracking (button clicks are counted)</li>
              <li>Automatically enrolling someone into the Friday Zoom or a funnel when they respond</li>
              <li>Text-message campaigns</li>
            </ul>
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button variant="outline" disabled={pending || !draft.name.trim() || (!dirty && Boolean(id))} onClick={() => save()}>
          {live ? "Save changes" : "Save draft"}
        </Button>
        {!live && (
          <Button disabled={pending || gaps.length > 0 || unknown.length > 0} onClick={() => setConfirming(true)}>
            Start campaign
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {!draft.name.trim() && "Name it to save. "}
          {gaps.length > 0 ? `Still needed to start: ${gaps.join(", ")}.` : live ? "" : "Nothing sends until you confirm."}
        </span>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start “{draft.name}”?</DialogTitle>
            <DialogDescription>Review before it goes live.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm">
            <li>
              <strong>{audience?.eligible ?? 0}</strong> {audience?.eligible === 1 ? "person" : "people"} in “{audience?.label}” will get “{draft.subject}”.
            </li>
            <li>{describeSchedule(draft.schedule)}.</li>
            {draft.schedule.mode === "once" && draft.schedule.now && <li>The first emails go out within about 5 minutes, a few at a time.</li>}
            {cap && audience && (
              <li>
                Your daily Gmail limit: {cap.used24h} of {cap.dailyLimit} used in the last 24 hours. {projectSend(cap, audience.eligible).message}
              </li>
            )}
            {setupIssues.length > 0 && (
              <li className="text-amber-700 dark:text-amber-400">
                Heads up: {setupIssues.join(", ")} {setupIssues.length === 1 ? "isn't" : "aren't"} set up right yet, so these emails may go to spam. You can start anyway, or fix it first (Email Log tab).
              </li>
            )}
            <li>Campaigns send only between 7 AM and 8 PM Eastern, and each email re-checks that the person is still on the list.</li>
            <li>Everyone who gets it is tagged “{tags.sent}”.</li>
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
            <Button disabled={pending} onClick={start}>
              Yes, start it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
