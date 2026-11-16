"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isActionError } from "@/lib/action-result";
import {
  FACT_FIELD_LABELS,
  checkPayoff,
  checkPurchaseContract,
  formatDayShort,
  formatMoney,
  type CheckState,
  type DealFileFacts,
  type DocFacts,
} from "@/lib/doc-facts";
import { applyContractClosingDate, applyPayoffExpirationDate } from "@/server/actions/doc-facts";

function PageLink({ page, onJump }: { page: number | null; onJump: (page: number) => void }) {
  if (!page) return null;
  return (
    <button type="button" onClick={() => onJump(page)} className="shrink-0 text-primary hover:underline">
      Page {page}
    </button>
  );
}

function Note({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  if (tone === "ok")
    return (
      <p className="flex items-start gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="mt-px size-3 shrink-0" />
        <span>{children}</span>
      </p>
    );
  if (tone === "warn")
    return (
      <p className="flex items-start gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <TriangleAlert className="mt-px size-3 shrink-0" />
        <span>{children}</span>
      </p>
    );
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

function checkNote(state: CheckState, fileText: string | null, what: string) {
  if (state === "match") return <Note tone="ok">Matches the loan inquiry.</Note>;
  if (state === "mismatch") return <Note tone="warn">Doesn’t match the loan inquiry{fileText ? `, which says ${fileText}` : ""}.</Note>;
  if (state === "no_file_value") return <Note tone="muted">No {what} on the loan inquiry to compare with.</Note>;
  return <Note tone="muted">Not found in the document.</Note>;
}

function Row({
  label,
  value,
  page,
  onJump,
  children,
}: {
  label: string;
  value: string | null;
  page: number | null;
  onJump: (page: number) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-start justify-between gap-2 font-medium">
        <span>{value ?? "Not found"}</span>
        <PageLink page={page} onJump={onJump} />
      </dd>
      {children}
    </div>
  );
}

/**
 * What the AI read off a purchase agreement or a payoff statement, checked against the deal. The processor looks at
 * it (page links jump to the spot in the document) and only then clicks the button that copies a date across.
 */
export function DocFactsCard({
  dealId,
  documentId,
  facts,
  deal,
  onJump,
}: {
  dealId: string;
  documentId: string;
  facts: DocFacts;
  deal: DealFileFacts;
  onJump: (page: number) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const f = facts.fields;

  function apply(action: () => ReturnType<typeof applyContractClosingDate>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  const isPurchase = facts.kind === "purchase_contract";
  const purchase = isPurchase ? checkPurchaseContract(facts, deal) : null;
  const payoff = !isPurchase ? checkPayoff(facts, deal) : null;

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="size-3.5" />
        {isPurchase ? "Purchase Agreement Scan" : "Payoff Scan"}
      </p>
      <dl className="space-y-2">
        {purchase && (
          <>
            <Row label={FACT_FIELD_LABELS.purchasePrice} value={purchase.price.contract !== null ? formatMoney(purchase.price.contract) : null} page={f.purchasePrice?.page ?? null} onJump={onJump}>
              {checkNote(purchase.price.state, purchase.price.file !== null ? formatMoney(purchase.price.file) : null, "purchase price")}
            </Row>
            <Row label={FACT_FIELD_LABELS.buyerName} value={purchase.buyer.contract} page={f.buyerName?.page ?? null} onJump={onJump}>
              {checkNote(purchase.buyer.state, purchase.buyer.file, "buyer")}
            </Row>
            <Row label={FACT_FIELD_LABELS.closingDate} value={purchase.closing.contract ? formatDayShort(purchase.closing.contract) : null} page={f.closingDate?.page ?? null} onJump={onJump}>
              {purchase.closing.state === "same" && <Note tone="ok">Matches the Est. Closing Date on file.</Note>}
              {purchase.closing.state === "not_found" && <Note tone="muted">Not found in the document.</Note>}
              {purchase.closing.state === "differs" && (
                <div className="space-y-1">
                  <Note tone="warn">
                    {purchase.closing.file ? `Est. Closing Date on file is ${formatDayShort(purchase.closing.file)}.` : "No Est. Closing Date on file yet."}
                  </Note>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => apply(() => applyContractClosingDate(dealId, documentId), "Est. Closing Date updated")}
                  >
                    Looks right: update Est. Closing Date
                  </Button>
                </div>
              )}
            </Row>
          </>
        )}
        {payoff && (
          <>
            <Row label={FACT_FIELD_LABELS.totalPayoff} value={payoff.total !== null ? formatMoney(payoff.total) : null} page={f.totalPayoff?.page ?? null} onJump={onJump} />
            <Row label={FACT_FIELD_LABELS.expirationDate} value={payoff.expiration ? formatDayShort(payoff.expiration) : null} page={f.expirationDate?.page ?? null} onJump={onJump}>
              {payoff.state === "not_found" && <Note tone="muted">No expiration date is shown on the statement.</Note>}
              {payoff.state === "added" && <Note tone="ok">Added to Key Dates.</Note>}
              {payoff.state === "ready" && (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => apply(() => applyPayoffExpirationDate(dealId, documentId), "Added to Key Dates")}
                >
                  Looks right: add to Key Dates
                </Button>
              )}
            </Row>
          </>
        )}
      </dl>
      <p className="text-[11px] text-muted-foreground">Read by AI. Click a page number to check it against the document before accepting.</p>
    </div>
  );
}
