"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SELECT_CLASS } from "@/components/marketing/form-classes";
import { addContact, clearBounced, deleteManualContact, markAgreed, markBounced, removeFromMarketing, removeTag, tagPeople } from "@/server/actions/marketing-audience";
import { audienceMembers, deriveTags, peopleToCsv, type AudienceOption, type AudiencePerson, type ConsentState } from "@/lib/marketing-audience";
import { cn } from "@/lib/utils";

const MAX_ROWS = 300;

type View = ConsentState;
const VIEW_LABEL: Record<View, string> = { agreed: "On the list", not_agreed: "Haven't agreed yet", unsubscribed: "Unsubscribed", bounced: "Bounced" };

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AudienceExplorer({ people, options, initialKey }: { people: AudiencePerson[]; options: AudienceOption[]; initialKey: string }) {
  const router = useRouter();
  const [key, setKey] = useState(options.some((o) => o.key === initialKey) ? initialKey : "all");
  const [view, setView] = useState<View | null>(null);
  const [search, setSearch] = useState("");
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagText, setTagText] = useState("");
  const [confirmingAgree, setConfirmingAgree] = useState(false);
  const [agreeNote, setAgreeNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const option = options.find((o) => o.key === key)!;
  const members = useMemo(() => audienceMembers(key, people) ?? [], [key, people]);
  const counts = useMemo(() => {
    const c: Record<View, number> = { agreed: 0, not_agreed: 0, unsubscribed: 0, bounced: 0 };
    for (const p of members) c[p.consent]++;
    return c;
  }, [members]);

  // Land on the tab that has people in it: borrowers usually have nobody who's agreed yet.
  const activeView: View = view ?? (counts.agreed > 0 ? "agreed" : counts.not_agreed > 0 ? "not_agreed" : "agreed");
  const q = search.trim().toLowerCase();
  const rows = members.filter(
    (p) => p.consent === activeView && (!q || `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(q)) && (!untaggedOnly || p.manualTags.length === 0)
  );
  const shown = rows.slice(0, MAX_ROWS);
  const picked = rows.filter((p) => selected.has(p.key));
  const groups = [...new Set(options.map((o) => o.group))];

  function choose(next: string) {
    setKey(next);
    setView(null);
    setSelected(new Set());
    setConfirmingAgree(false);
    const url = new URL(window.location.href);
    url.searchParams.set("audience", next);
    window.history.replaceState(null, "", url);
  }

  function run<T extends { ok: true }>(fn: () => Promise<T | { error: string }>, success: (r: T) => string) {
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(success(r));
        router.refresh();
      }
    });
  }

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="audience-pick">Audience</Label>
          <select id="audience-pick" className={SELECT_CLASS} value={key} onChange={(e) => choose(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {options
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label} ({o.eligible})
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add contact
        </Button>
        <Button
          variant="outline"
          disabled={rows.length === 0}
          onClick={() => download(`${option.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${activeView}.csv`, peopleToCsv(picked.length ? picked : rows))}
        >
          <Download className="size-4" /> Export {picked.length ? `${picked.length} selected` : `${rows.length}`}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {option.description} <strong className="text-foreground">{option.eligible}</strong> {option.eligible === 1 ? "person" : "people"} can be emailed.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setView(v);
              setSelected(new Set());
              setConfirmingAgree(false);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              activeView === v ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {VIEW_LABEL[v]} <span className="tabular-nums">({counts[v]})</span>
          </button>
        ))}
        <Input className="ml-auto max-w-56" placeholder="Search name, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={untaggedOnly} onChange={(e) => setUntaggedOnly(e.target.checked)} />
          No tags of mine yet
        </label>
      </div>

      {activeView === "not_agreed" && counts.not_agreed > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          These people can&apos;t be emailed until you record that they agreed to marketing. Only do that for people who actually told you they&apos;re OK with it; if they haven&apos;t, keep reaching out
          personally (the Follow Up Assistant can remind you).
        </p>
      )}

      {picked.length > 0 && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{picked.length} selected</span>
            <Input className="max-w-48" placeholder="Add a tag, e.g. oct webinar" value={tagText} onChange={(e) => setTagText(e.target.value)} />
            <Button
              size="sm"
              disabled={pending || !tagText.trim()}
              onClick={() =>
                run(
                  () => tagPeople(picked.map((p) => p.key), tagText),
                  (r) => `Tagged ${r.count}`
                )
              }
            >
              Add tag
            </Button>
            {activeView === "not_agreed" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmingAgree(true)}>
                Mark as agreed
              </Button>
            )}
            {activeView === "agreed" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => removeFromMarketing(picked.map((p) => p.key)),
                      (r) => `Took ${r.count} off the marketing list`
                    )
                  }
                >
                  Remove from marketing
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => markBounced(picked.map((p) => p.key)),
                      (r) => `Marked ${r.count} as bounced. They won't be emailed again.`
                    )
                  }
                >
                  Mark as bounced
                </Button>
              </>
            )}
            {activeView === "bounced" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => clearBounced(picked.map((p) => p.key)),
                    (r) => `Cleared the bounce on ${r.count}`
                  )
                }
              >
                Not bounced after all
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          {confirmingAgree && (
            <div className="space-y-2 border-t pt-2">
              <p className="text-sm">
                You&apos;re confirming that these {picked.length} people told you they&apos;re OK receiving marketing emails from you. This is recorded with today&apos;s date.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input className="max-w-80" placeholder="How they agreed (optional), e.g. said yes on the phone" value={agreeNote} onChange={(e) => setAgreeNote(e.target.value)} />
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => markAgreed(picked.map((p) => p.key), agreeNote),
                      (r) => `Recorded ${r.recorded} as agreed${r.skipped > 0 ? `; ${r.skipped} had unsubscribed themselves and were left off` : ""}`
                    )
                  }
                >
                  Yes, they agreed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingAgree(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 p-2">
                <input
                  type="checkbox"
                  aria-label="Select everyone shown"
                  checked={allShownSelected}
                  onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((p) => p.key)))}
                />
              </th>
              <th className="p-2">Who</th>
              <th className="p-2">Tags</th>
              <th className="p-2">Marketing</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  {members.length === 0 ? "Nobody is in this audience yet." : "Nobody matches."}
                </td>
              </tr>
            )}
            {shown.map((p) => (
              <tr key={p.key} className={cn(selected.has(p.key) && "bg-muted/50")}>
                <td className="p-2 align-top">
                  <input type="checkbox" aria-label={`Select ${p.name || p.email}`} checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
                </td>
                <td className="p-2 align-top">
                  <div className="font-medium">{p.name || p.email}</div>
                  <div className="text-xs text-muted-foreground">{[p.name ? p.email : null, p.phone].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="p-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    {deriveTags(p).map((t) => (
                      <Badge key={t} variant="outline" className="font-normal">
                        {t}
                      </Badge>
                    ))}
                    {p.manualTags.map((t) => (
                      <Badge key={t} variant="secondary" className="gap-1 font-normal">
                        {t}
                        <button
                          type="button"
                          aria-label={`Remove tag ${t}`}
                          className="opacity-60 hover:opacity-100"
                          onClick={() =>
                            run(
                              () => removeTag(p.key, t),
                              () => "Tag removed"
                            )
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                    {p.manualTags.length === 0 && <span className="text-xs text-muted-foreground">no tags of yours</span>}
                  </div>
                </td>
                <td className="p-2 align-top">
                  {p.consent === "agreed" && (
                    <div>
                      <Badge variant="success">Agreed</Badge>
                      {p.consentNote && <div className="mt-1 max-w-56 text-xs text-muted-foreground">{p.consentNote}</div>}
                    </div>
                  )}
                  {p.consent === "not_agreed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setSelected(new Set([p.key]));
                        setConfirmingAgree(true);
                      }}
                    >
                      Mark as agreed
                    </Button>
                  )}
                  {p.consent === "unsubscribed" && <Badge variant="destructive">Unsubscribed</Badge>}
                  {p.consent === "bounced" && <Badge variant="warning">Bounced</Badge>}
                  {p.addedManually && p.consent !== "unsubscribed" && (
                    <button
                      type="button"
                      className="mt-1 block text-xs text-muted-foreground underline"
                      onClick={() => {
                        if (confirm(`Delete ${p.name || p.email} from your lists?`))
                          run(
                            () => deleteManualContact(p.email),
                            () => "Deleted"
                          );
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_ROWS && (
        <p className="text-xs text-muted-foreground">
          Showing the first {MAX_ROWS} of {rows.length}. Search to narrow it down; Export includes all {rows.length}.
        </p>
      )}

      <AddContactDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", tag: "", agreed: false });
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function submit() {
    startTransition(async () => {
      const r = await addContact(form);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Added ${form.name.trim()}`);
      setForm({ name: "", email: "", phone: "", tag: "", agreed: false });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>Someone who isn&apos;t in the CRM yet. They only get marketing emails if you record that they agreed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-name">Name</Label>
            <Input id="ac-name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-email">Email</Label>
            <Input id="ac-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-phone">Phone (optional)</Label>
            <Input id="ac-phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-tag">Tag (optional)</Label>
            <Input id="ac-tag" placeholder="e.g. met at expo" value={form.tag} onChange={(e) => set({ tag: e.target.value })} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={form.agreed} onChange={(e) => set({ agreed: e.target.checked })} />
            <span>They told me they&apos;re OK receiving marketing emails from me.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || !form.name.trim() || !form.email.trim()} onClick={submit}>
            Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
