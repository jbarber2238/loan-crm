"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCatalogItemsToDeal, addClientNeedToDeal } from "@/server/actions/client-needs";
import { ClientNeedForm } from "@/components/client-needs/client-need-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CLIENT_NEED_TYPES, labelFor } from "@/lib/labels";

export interface DealCatalogItem {
  id: string;
  itemName: string;
  needType: "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form" | "custom_form";
  isCustom: boolean;
}

export function AddClientNeedToDealDialog({
  dealId,
  catalog,
  allProducts,
  open,
  onOpenChange,
}: {
  dealId: string;
  catalog: DealCatalogItem[];
  allProducts: { id: string; label: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [customPending, startCustomTransition] = useTransition();
  const [customError, setCustomError] = useState<string | null>(null);

  const sorted = [...catalog].sort((a, b) => a.itemName.localeCompare(b.itemName));

  function handleSelectFromList(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addCatalogItemsToDeal(dealId, formData);
        onOpenChange(false);
        toast.success("Needs added");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't add those needs.";
        setError(message);
        toast.error(message);
      }
    });
  }

  function handleCustomAdd(formData: FormData) {
    setCustomError(null);
    startCustomTransition(async () => {
      try {
        await addClientNeedToDeal(dealId, formData);
        onOpenChange(false);
        toast.success("Need added");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setCustomError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Client Need</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">Select from List</TabsTrigger>
            <TabsTrigger value="custom">Custom Need</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-3 pt-2">
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <form ref={formRef} onSubmit={handleSelectFromList} className="space-y-3">
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {sorted.map((item) => {
                  const matches = item.itemName.toLowerCase().includes(search.toLowerCase());
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50 ${matches ? "" : "hidden"}`}
                    >
                      <Checkbox name="clientNeedId" value={item.id} />
                      <span className="flex-1">{item.itemName}</span>
                      {item.isCustom && (
                        <Badge variant="secondary" className="text-[10px]">
                          Custom
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{labelFor(CLIENT_NEED_TYPES, item.needType)}</span>
                    </label>
                  );
                })}
                {sorted.length === 0 && (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">No client needs in the catalog yet.</p>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {sorted.length > 0 && (
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Adding…" : "Add Selected"}
                </Button>
              )}
            </form>
          </TabsContent>

          <TabsContent value="custom" className="pt-2">
            <ClientNeedForm
              formId="deal-custom-need"
              allProducts={allProducts}
              onSubmit={handleCustomAdd}
              submitLabel="Add"
              pending={customPending}
              error={customError}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
