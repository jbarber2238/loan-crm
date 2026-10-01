"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeClientNeedDocument } from "@/server/actions/client-need-documents";
import type { DealCatalogItem } from "@/components/deals/add-client-need-to-deal-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface ChangeNeedCandidate {
  id: string;
  itemName: string;
  needType: string;
  status: string;
}

type Mode = "existing" | "new_standard" | "custom";

/**
 * Moves a single document to a different client need — a document uploaded
 * to the wrong slot (e.g. the operating agreement and articles of
 * organization both landed on "Entity Docs: Operating Agreement") gets
 * reassigned, not duplicated. Always a move: the document never stays
 * behind in the need it came from.
 */
export function ChangeNeedDialog({
  dealId,
  documentId,
  sourceNeedId,
  needs,
  catalog,
  trigger,
}: {
  dealId: string;
  documentId: string;
  sourceNeedId: string;
  needs: ChangeNeedCandidate[];
  catalog: DealCatalogItem[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("existing");
  const [existingNeedId, setExistingNeedId] = useState("");
  const [catalogNeedId, setCatalogNeedId] = useState("");
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only document_upload needs make sense as a destination, and a need
  // that's been marked unused is treated as inert — not a valid move target.
  const existingOptions = needs.filter(
    (n) => n.id !== sourceNeedId && n.needType === "document_upload" && n.status !== "unused"
  );
  const existingNeedNames = new Set(needs.map((n) => n.itemName.toLowerCase()));
  // The actual fix for "duplicate entries in the dropdown": only standard
  // catalog items not already on this deal, by name.
  const standardOptions = catalog.filter(
    (c) => !c.isCustom && c.needType === "document_upload" && !existingNeedNames.has(c.itemName.toLowerCase())
  );

  function handleSubmit() {
    setError(null);
    if (mode === "existing" && !existingNeedId) {
      setError("Pick a need to move it to");
      return;
    }
    if (mode === "new_standard" && !catalogNeedId) {
      setError("Pick a standard need to create");
      return;
    }
    if (mode === "custom" && !customName.trim()) {
      setError("Name the new need");
      return;
    }

    startTransition(async () => {
      try {
        await changeClientNeedDocument(
          dealId,
          documentId,
          mode === "existing"
            ? { type: "existing", needId: existingNeedId }
            : mode === "new_standard"
              ? { type: "new_standard", catalogNeedId }
              : { type: "custom", itemName: customName.trim() }
        );
        setOpen(false);
        toast.success("Document moved");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't move this document.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move this document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Moves the document to a different client need — it won&apos;t be left behind in this one.
          </p>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem value="existing" disabled={existingOptions.length === 0} />
                An existing need on this deal
              </label>
              {mode === "existing" && (
                <Select value={existingNeedId} onValueChange={setExistingNeedId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={existingOptions.length ? "Select a need" : "No other needs on this deal"} />
                  </SelectTrigger>
                  <SelectContent>
                    {existingOptions.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.itemName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem value="new_standard" disabled={standardOptions.length === 0} />
                A new need from the standard list
              </label>
              {mode === "new_standard" && (
                <Select value={catalogNeedId} onValueChange={setCatalogNeedId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={standardOptions.length ? "Select a standard need" : "All standard needs are already on this deal"} />
                  </SelectTrigger>
                  <SelectContent>
                    {standardOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.itemName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem value="custom" />A new custom need
              </label>
              {mode === "custom" && (
                <div className="space-y-1.5">
                  <Label htmlFor="change-need-custom-name" className="sr-only">
                    New need name
                  </Label>
                  <Input
                    id="change-need-custom-name"
                    placeholder="e.g. Second Entity — Operating Agreement"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                </div>
              )}
            </div>
          </RadioGroup>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={pending} onClick={handleSubmit}>
            {pending ? "Moving…" : "Move Document"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
