"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClientNeed, updateClientNeed } from "@/server/actions/client-need-catalog";
import { ClientNeedForm, type ExistingClientNeed } from "@/components/client-needs/client-need-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Create-a-standard-need or edit-an-existing-catalog-entry dialog. */
export function ClientNeedDialog({
  clientNeed,
  allProducts,
  trigger,
}: {
  clientNeed?: ExistingClientNeed;
  allProducts?: { id: string; label: string }[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const isEdit = !!clientNeed;

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateClientNeed(clientNeed.id, formData);
        } else {
          await createClientNeed(formData);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client need" : "New client need"}</DialogTitle>
        </DialogHeader>
        <ClientNeedForm
          formId={`client-need-${clientNeed?.id ?? "new"}`}
          clientNeed={clientNeed}
          allProducts={allProducts}
          onSubmit={handleSubmit}
          submitLabel={isEdit ? "Save changes" : "Add to catalog"}
          pending={pending}
          error={error}
        />
      </DialogContent>
    </Dialog>
  );
}
