"use client";

import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { confirmMessage: string }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
        onClick?.(e);
      }}
    />
  );
}
