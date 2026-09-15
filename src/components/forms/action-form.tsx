"use client";

import { createContext, useContext, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { unstable_rethrow as rethrowFrameworkSignals } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PendingContext = createContext(false);

/** Lets a SubmitButton anywhere inside an ActionForm know whether it's mid-submit. */
export function useFormPending() {
  return useContext(PendingContext);
}

// Every "Save"/"Add"/"Remove" form in the app used a plain <form action={fn}>
// with no feedback: nothing showed while it saved, and nothing confirmed it
// worked. This wraps that same server-action pattern with a toast on
// success/failure and a pending state (disabling the fields via <fieldset>
// so a SubmitButton's spinner isn't the only sign something's happening).
export function ActionForm({
  action,
  successMessage,
  confirmMessage,
  children,
  className,
  onSuccess,
}: {
  action: (formData: FormData) => Promise<unknown>;
  successMessage?: string;
  confirmMessage?: string;
  children: ReactNode;
  className?: string;
  onSuccess?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingFormData = useRef<FormData | null>(null);

  function runAction(formData: FormData) {
    startTransition(async () => {
      try {
        await action(formData);
        if (successMessage) toast.success(successMessage);
        onSuccess?.();
      } catch (err) {
        // A server action that calls redirect()/notFound() signals it by
        // throwing — rethrow those so Next still navigates instead of us
        // swallowing the throw and reporting it as a failed save.
        rethrowFrameworkSignals(err);
        toast.error(err instanceof Error ? err.message : "Something went wrong — try again.");
      }
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (confirmMessage) {
      pendingFormData.current = formData;
      setConfirmOpen(true);
      return;
    }
    runAction(formData);
  }

  return (
    <PendingContext.Provider value={isPending}>
      <form onSubmit={handleSubmit} className={className}>
        <fieldset disabled={isPending} className="contents">
          {children}
        </fieldset>
      </form>
      {confirmMessage && (
        <ConfirmDialog
          open={confirmOpen}
          message={confirmMessage}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            if (pendingFormData.current) runAction(pendingFormData.current);
          }}
        />
      )}
    </PendingContext.Provider>
  );
}
