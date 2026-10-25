"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Search } from "lucide-react";
import type { ReviewRow } from "@/server/reviews-data";
import { CLOSING_SURVEY_REQUESTS, average, netPromoterScore } from "@/lib/closing-survey";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublishReviewButton, SurveyRowActions } from "@/components/reviews/review-controls";

type SortKey = "date" | "client" | "communication" | "process" | "speed" | "terms" | "recommend";
type Filter = "all" | "answered" | "waiting" | "review" | "website";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "answered", label: "Answered" },
  { key: "waiting", label: "Waiting" },
  { key: "review", label: "Has a review" },
  { key: "website", label: "On website" },
];

const SCORE_COLUMNS: { key: Extract<SortKey, "communication" | "process" | "speed" | "terms" | "recommend">; label: string; hint: string }[] = [
  { key: "communication", label: "Communication", hint: "How responsive and clear we were" },
  { key: "process", label: "Process clarity", hint: "Always knew what was needed and what came next" },
  { key: "speed", label: "Speed to close", hint: "How fast we got them to the closing table" },
  { key: "terms", label: "Terms & lender", hint: "Happy with the terms and the lender we found" },
  { key: "recommend", label: "Would recommend", hint: "Likelihood to recommend us (the Net Promoter question)" },
];

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

function ScorePill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">–</span>;
  const tone =
    value >= 9
      ? "bg-green-600/15 text-green-800 dark:text-green-300"
      : value >= 7
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
        : "bg-destructive/15 text-destructive";
  return <span className={`inline-flex min-w-9 justify-center rounded-md px-2 py-1 text-sm font-semibold tabular-nums ${tone}`}>{value}</span>;
}

function StatusLine({ row }: { row: ReviewRow }) {
  if (row.status === "answered") return null;
  const text =
    row.status === "waiting"
      ? `Waiting · ${row.requestsSent} of ${CLOSING_SURVEY_REQUESTS} sent`
      : row.status === "no_response"
        ? `No response after ${CLOSING_SURVEY_REQUESTS} requests`
        : "Reminders stopped";
  return <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>;
}

function sortValue(row: ReviewRow, key: SortKey): number | string | null {
  if (key === "date") return new Date(row.answeredAt ?? row.sentAt).getTime();
  if (key === "client") return row.client.toLowerCase();
  return row[key];
}

function SortHead({
  k,
  sort,
  onSort,
  children,
  hint,
  className = "",
}: {
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th scope="col" className={`px-3 py-2.5 font-medium ${className}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" title={hint} onClick={() => onSort(k)} className="inline-flex items-center gap-1 text-left hover:text-foreground">
        {children}
        <span aria-hidden="true" className={active ? "text-foreground" : "text-transparent"}>
          {active && sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export function ReviewsTable({ rows }: { rows: ReviewRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !`${r.client} ${r.property} ${r.loanNumber ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "answered") return r.status === "answered";
      if (filter === "waiting") return r.status === "waiting";
      if (filter === "review") return Boolean(r.publicReview?.trim());
      if (filter === "website") return r.published;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Blank scores always sink to the bottom, whichever way the column is sorted.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, filter, sort]);

  const answered = rows.filter((r) => r.status === "answered");
  const nps = netPromoterScore(answered.map((r) => r.recommend).filter((v): v is number => v !== null));
  const shownAnswered = visible.filter((r) => r.status === "answered");

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "client" ? "asc" : "desc" }));
  }
  function toggleOpen(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const stats = [
    { label: "Net Promoter Score", value: nps === null ? "–" : String(nps), note: "–100 to 100" },
    { label: "Answered", value: `${answered.length} of ${rows.length}`, note: rows.length ? `${Math.round((answered.length / rows.length) * 100)}% response` : "" },
    { label: "On the website", value: String(rows.filter((r) => r.published).length), note: "published reviews" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase">{s.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search client, address or loan #" className="pl-8" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter reviews">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  filter === f.key ? "border-foreground bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/directory/reviews/export?format=csv" download>
              <Download className="size-4" />
              CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/directory/reviews/export?format=xlsx" download>
              <FileSpreadsheet className="size-4" />
              Excel
            </a>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2.5" aria-label="Expand" />
              <SortHead k="client" sort={sort} onSort={toggleSort} className="text-left">Client</SortHead>
              <SortHead k="date" sort={sort} onSort={toggleSort} className="text-left">Date</SortHead>
              {SCORE_COLUMNS.map((c) => (
                <SortHead key={c.key} k={c.key} sort={sort} onSort={toggleSort} hint={c.hint} className="text-center">
                  {c.label}
                </SortHead>
              ))}
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Review</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  {rows.length === 0 ? "Nothing yet. The first survey goes out the next time a deal is marked Closed." : "No reviews match."}
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const isOpen = open.has(r.id);
              const hasNotes = Boolean(r.privateFeedback?.trim() || r.publicReview?.trim());
              return (
                <Fragment key={r.id}>
                  <tr className={`border-b last:border-b-0 ${isOpen ? "bg-muted/30" : "hover:bg-muted/20"}`}>
                    <td className="px-2 py-2.5 align-top">
                      <button
                        type="button"
                        onClick={() => toggleOpen(r.id)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} details for ${r.client}`}
                        className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
                      >
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <Link href={`/deals/${r.dealId}`} className="font-medium hover:underline">
                        {r.client}
                      </Link>
                      <span className="block max-w-64 truncate text-xs text-muted-foreground">{r.property}</span>
                      <StatusLine row={r} />
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap text-muted-foreground">
                      {r.answeredAt ? shortDate(r.answeredAt) : <span title="Survey sent">Sent {shortDate(r.sentAt)}</span>}
                    </td>
                    {SCORE_COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-2.5 text-center align-top">
                        <ScorePill value={r[c.key]} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 align-top">
                      {r.published ? (
                        <Badge variant="success">On website</Badge>
                      ) : r.publicReview?.trim() ? (
                        <Badge variant={r.permission ? "secondary" : "destructive"}>{r.permission ? "Ready to publish" : "Not shared"}</Badge>
                      ) : hasNotes ? (
                        <span className="text-xs text-muted-foreground">Private note</span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-muted/30 last:border-b-0">
                      <td />
                      <td colSpan={8} className="px-3 pt-1 pb-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1 rounded-lg border bg-background p-3">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Private feedback (never public)</p>
                            <p className="text-sm whitespace-pre-wrap">
                              {r.privateFeedback?.trim() || <span className="text-muted-foreground">None left.</span>}
                            </p>
                          </div>
                          <div className="space-y-2 rounded-lg border bg-background p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase">Public review</p>
                              {r.publicReview?.trim() && (
                                <Badge variant={r.permission ? "success" : "destructive"}>
                                  {r.permission ? "Permission to use it" : "No permission to use it"}
                                </Badge>
                              )}
                            </div>
                            {r.publicReview?.trim() ? (
                              <>
                                <blockquote className="text-sm whitespace-pre-wrap">&ldquo;{r.publicReview}&rdquo;</blockquote>
                                <p className="text-xs text-muted-foreground">Shown as {r.reviewerName}</p>
                                <PublishReviewButton surveyId={r.id} published={r.published} allowed={r.permission} />
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">None left.</p>
                            )}
                          </div>
                        </div>
                        {r.status !== "answered" && (
                          <div className="mt-3">
                            <SurveyRowActions
                              surveyId={r.id}
                              status={r.status === "waiting" ? "pending" : r.status}
                              requestsSent={r.requestsSent}
                              total={CLOSING_SURVEY_REQUESTS}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {shownAnswered.length > 0 && (
            <tfoot className="border-t bg-muted/40 text-xs font-medium">
              <tr>
                <td />
                <td className="px-3 py-2.5" colSpan={2}>
                  Average of {shownAnswered.length} answered
                </td>
                {SCORE_COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-2.5 text-center text-sm tabular-nums">
                    {average(shownAnswered.map((r) => r[c.key])) ?? "–"}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
