"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAudience, removeTag, saveAudience, tagMatchingPeople, tagPerson } from "@/server/actions/marketing-audience";
import {
  EMPTY_FILTERS,
  FRIDAY_OPTIONS,
  STATUS_OPTIONS,
  applyFilters,
  countBy,
  deriveTags,
  describeFilters,
  hasAnyFilter,
  sourceLabel,
  type AudienceFilters,
  type AudiencePerson,
} from "@/lib/marketing-audience";
import { cn } from "@/lib/utils";
import type { EligibilitySummary, SavedAudience } from "@/server/marketing-audience";

const MAX_ROWS = 200;

function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function AudienceExplorer({ people, summary, saved }: { people: AudiencePerson[]; summary: EligibilitySummary; saved: SavedAudience[] }) {
  const router = useRouter();
  const [filters, setFilters] = useState<AudienceFilters>(EMPTY_FILTERS);
  const [tagText, setTagText] = useState("");
  const [audienceName, setAudienceName] = useState("");
  const [pending, startTransition] = useTransition();

  const matches = useMemo(() => applyFilters(people, filters), [people, filters]);
  const sources = useMemo(() => countBy(people, (p) => p.source), [people]);
  const roles = useMemo(() => countBy(people, (p) => p.role), [people]);
  const statuses = useMemo(() => countBy(people, (p) => p.status), [people]);
  const fridays = useMemo(() => countBy(people, (p) => p.fridayStatus), [people]);
  const manualTagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of people) for (const t of p.manualTags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [people]);
  const set = (patch: Partial<AudienceFilters>) => setFilters((f) => ({ ...f, ...patch }));

  function run(action: () => Promise<{ error: string } | { ok: true; count?: number }>, success: (count?: number) => string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) toast.error(result.error);
      else {
        toast.success(success(result.count));
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <Eligibility summary={summary} />

      {saved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Saved audiences</h2>
          <ul className="flex flex-wrap gap-2">
            {saved.map((a) => (
              <li key={a.id} className="flex items-center gap-1 rounded-md border pl-3 text-sm">
                <button type="button" className="py-1.5 text-left hover:underline" onClick={() => setFilters(a.filters)} title={describeFilters(a.filters)}>
                  {a.name} <span className="text-muted-foreground">· {applyFilters(people, a.filters).length}</span>
                </button>
                <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Delete ${a.name}`} disabled={pending} onClick={() => run(() => deleteAudience(a.id), () => "Audience deleted")}>
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Choose who</h2>
          {hasAnyFilter(filters) && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear all
            </Button>
          )}
        </div>

        <ChipGroup label="Where they came from" options={sources.map((s) => ({ value: s.value, label: sourceLabel(s.value), count: s.count }))} selected={filters.sources} onToggle={(v) => set({ sources: toggled(filters.sources, v) })} />
        <ChipGroup label="Friday Zoom" options={FRIDAY_OPTIONS.map((o) => ({ ...o, count: fridays.find((f) => f.value === o.value)?.count ?? 0 }))} selected={filters.friday} onToggle={(v) => set({ friday: toggled(filters.friday, v) })} />
        <ChipGroup label="Role" options={roles.map((r) => ({ value: r.value, label: r.value, count: r.count }))} selected={filters.roles} onToggle={(v) => set({ roles: toggled(filters.roles, v) })} />
        <ChipGroup label="Lead status" options={STATUS_OPTIONS.map((o) => ({ ...o, count: statuses.find((s) => s.value === o.value)?.count ?? 0 }))} selected={filters.statuses} onToggle={(v) => set({ statuses: toggled(filters.statuses, v) })} />
        {manualTagCounts.length > 0 && (
          <ChipGroup label="Your tags" options={manualTagCounts.map((t) => ({ value: t.value, label: t.value, count: t.count }))} selected={filters.tags} onToggle={(v) => set({ tags: toggled(filters.tags, v) })} />
        )}

        <div className="flex flex-wrap items-end gap-4">
          <Segment label="Partner" value={filters.partner} options={[["any", "Anyone"], ["signed", "Signed"], ["not_signed", "Not signed"]]} onChange={(v) => set({ partner: v as AudienceFilters["partner"] })} />
          <Segment label="Became a deal" value={filters.becameDeal} options={[["any", "Anyone"], ["yes", "Yes"], ["no", "Not yet"]]} onChange={(v) => set({ becameDeal: v as AudienceFilters["becameDeal"] })} />
          <div className="space-y-1.5">
            <Label htmlFor="joined-from" className="text-xs text-muted-foreground">Joined between</Label>
            <div className="flex items-center gap-2">
              <Input id="joined-from" type="date" className="h-8 w-36" value={filters.joinedFrom ?? ""} onChange={(e) => set({ joinedFrom: e.target.value || null })} />
              <span className="text-xs text-muted-foreground">and</span>
              <Input aria-label="Joined before" type="date" className="h-8 w-36" value={filters.joinedTo ?? ""} onChange={(e) => set({ joinedTo: e.target.value || null })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aud-search" className="text-xs text-muted-foreground">Name or email</Label>
            <Input id="aud-search" className="h-8 w-48" value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <strong className="text-base">{matches.length}</strong> of {people.length} eligible {people.length === 1 ? "person matches" : "people match"}
            {hasAnyFilter(filters) && <span className="text-muted-foreground"> · {describeFilters(filters)}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Tag name" className="h-8 w-44" placeholder="Tag, e.g. oct 30 webinar" value={tagText} onChange={(e) => setTagText(e.target.value)} />
            <Button type="button" size="sm" variant="outline" disabled={pending || !tagText.trim() || matches.length === 0} onClick={() => run(() => tagMatchingPeople(filters, tagText), (n) => `Tagged ${n} ${n === 1 ? "person" : "people"}`, () => setTagText(""))}>
              Tag these {matches.length}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Audience name" className="h-8 w-56" placeholder="Name this audience to save it" value={audienceName} onChange={(e) => setAudienceName(e.target.value)} />
          <Button type="button" size="sm" variant="outline" disabled={pending || audienceName.trim().length < 2} onClick={() => run(() => saveAudience(audienceName, filters), () => "Audience saved", () => setAudienceName(""))}>
            Save audience
          </Button>
        </div>

        <PeopleTable people={matches.slice(0, MAX_ROWS)} pending={pending} run={run} />
        {matches.length > MAX_ROWS && <p className="text-xs text-muted-foreground">Showing the first {MAX_ROWS} of {matches.length}. Narrow the filters to see the rest.</p>}
      </section>
    </div>
  );
}

function Eligibility({ summary }: { summary: EligibilitySummary }) {
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Who can be emailed</h2>
      <p className="text-sm">
        <strong>{summary.eligibleLeads}</strong> {summary.eligibleLeads === 1 ? "person has" : "people have"} agreed to marketing emails and can be targeted below.
        {summary.unsubscribed > 0 && ` ${summary.unsubscribed} unsubscribed and are left out.`}
        {summary.noConsentLeads > 0 && ` ${summary.noConsentLeads} leads never agreed and are left out.`}
      </p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {summary.notEligible.map((g) => (
          <li key={g.label}>
            <strong className="text-foreground">{g.count} {g.label.toLowerCase()}</strong> are not on the list yet. {g.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChipGroup({ label, options, selected, onToggle }: { label: string; options: { value: string; label: string; count: number }[]; selected: string[]; onToggle: (value: string) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {o.label} <span className={on ? "opacity-80" : "text-muted-foreground"}>{o.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Segment({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex overflow-hidden rounded-md border">
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={cn("px-3 py-1 text-xs", value === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function PeopleTable({ people, pending, run }: { people: AudiencePerson[]; pending: boolean; run: (action: () => Promise<{ error: string } | { ok: true; count?: number }>, success: (count?: number) => string, after?: () => void) => void }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState("");
  if (people.length === 0) return <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No one matches these filters.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Person</th>
            <th className="px-3 py-2 font-medium">Tags</th>
            <th className="px-3 py-2 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {people.map((p) => (
            <tr key={p.id} className="align-top">
              <td className="px-3 py-2">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.email}</div>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  {deriveTags(p).map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                  ))}
                  {p.manualTags.map((t) => (
                    <Badge key={t} variant="outline" className="gap-1 font-normal">
                      {t}
                      <button type="button" aria-label={`Remove tag ${t}`} disabled={pending} onClick={() => run(() => removeTag(p.id, t), () => "Tag removed")}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  {adding === p.id ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(() => tagPerson(p.id, text), () => "Tag added", () => { setAdding(null); setText(""); });
                      }}
                    >
                      <Input autoFocus aria-label="New tag" className="h-6 w-32 text-xs" value={text} onChange={(e) => setText(e.target.value)} />
                      <Button type="submit" size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={pending || !text.trim()}>Add</Button>
                    </form>
                  ) : (
                    <button type="button" className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted" onClick={() => { setAdding(p.id); setText(""); }}>
                      + tag
                    </button>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(new Date(p.joinedAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
