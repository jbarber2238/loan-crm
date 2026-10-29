"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, FileCheck2 } from "lucide-react";
import { copyEntityDocsFromPriorDeal, declineEntityDocCarryOver } from "@/server/actions/entity-doc-carryover";
import { isActionError } from "@/lib/action-result";
import type { EntityDocOffer } from "@/lib/entity-doc-carryover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Shown the first time a repeat borrower's deal is opened after the processing fee is paid. If the email
 * matches too it goes straight to the document list; if only the name and entity match it first asks
 * whether this is the same borrower. "No thanks" is remembered for that person only, so every other user still sees this until they answer too. Closing it without answering leaves the question for next time.
 */
export function EntityDocCarryOverDialog({ dealId, offer }: { dealId: string; offer: EntityDocOffer }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [confirmed, setConfirmed] = useState(offer.emailMatches);
  const [picked, setPicked] = useState<Set<string>>(new Set(offer.items.filter((i) => i.group === "entity").map((i) => i.key)));
  const [pending, startTransition] = useTransition();
  const { prior } = offer;
  const entityItems = offer.items.filter((i) => i.group === "entity");
  const optionalItems = offer.items.filter((i) => i.group === "optional");

  function decline() {
    startTransition(async () => {
      await declineEntityDocCarryOver(dealId);
      setOpen(false);
      router.refresh();
    });
  }

  function copy() {
    startTransition(async () => {
      const result = await copyEntityDocsFromPriorDeal(dealId, prior.id, [...picked], confirmed);
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`Copied ${result.copied} document${result.copied === 1 ? "" : "s"} from loan #${result.from}`);
      setOpen(false);
      router.refresh();
    });
  }

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {!confirmed ? (
          <>
            <DialogHeader>
              <DialogTitle>Is this the same borrower?</DialogTitle>
              <DialogDescription>
                The borrower name and entity match loan #{prior.loanNumber} ({prior.address}), but the email is different:
                {" "}
                <strong>{offer.currentBorrowerEmail ?? "none on file"}</strong> here and <strong>{prior.borrowerEmail ?? "none on file"}</strong> there.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={pending} onClick={decline}>
                No, a different borrower
              </Button>
              <Button type="button" disabled={pending} onClick={() => setConfirmed(true)}>
                Yes, same borrower
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Bring over documents from the earlier deal?</DialogTitle>
              <DialogDescription>
                {offer.emailMatches
                  ? `The borrower name, email and entity name are identical to loan #${prior.loanNumber} (${prior.address}).`
                  : `You confirmed this is the same borrower as loan #${prior.loanNumber} (${prior.address}).`}{" "}
                Copy the documents already on file from that deal?
              </DialogDescription>
            </DialogHeader>
            {entityItems.length > 0 && <ItemList items={entityItems} picked={picked} toggle={toggle} />}
            {optionalItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    <strong>Other documents from that deal.</strong> These may not apply to this one, so none are selected for you. Only bring
                    a document over if it really does, and expect to edit it. They come over for you to review, not as approved.
                  </p>
                </div>
                <ItemList items={optionalItems} picked={picked} toggle={toggle} />
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={pending} onClick={decline}>
                No thanks
              </Button>
              <Button type="button" disabled={pending || picked.size === 0} onClick={copy}>
                {pending ? "Copying…" : `Copy ${picked.size} document type${picked.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemList({
  items,
  picked,
  toggle,
}: {
  items: EntityDocOffer["items"];
  picked: Set<string>;
  toggle: (key: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={picked.has(item.key)}
              onChange={() => toggle(item.key)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <FileCheck2 className="size-4 text-muted-foreground" />
                {item.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {item.fileCount} file{item.fileCount === 1 ? "" : "s"}
                {item.group === "optional"
                  ? `. ${item.note ?? ""}`
                  : item.needsReview
                    ? ". Comes over for you to re-approve, since these go out of date."
                    : ". Comes over approved and marked accepted."}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
