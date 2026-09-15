"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormPending } from "@/components/forms/action-form";
import type { ComponentProps } from "react";

/** A submit button that spinners and disables itself while its ActionForm is mid-submit. */
export function SubmitButton({ children, disabled, ...props }: ComponentProps<typeof Button>) {
  const isPending = useFormPending();
  return (
    <Button type="submit" disabled={isPending || disabled} {...props}>
      {isPending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
