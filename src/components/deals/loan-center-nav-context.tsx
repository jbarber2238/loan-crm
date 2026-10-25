"use client";

import { createContext, useContext } from "react";

/** Lets something inside a Loan Center section (the full-screen team chat) switch sections, e.g. "back". */
export const LoanCenterNavContext = createContext<{ goToTab: (value: string) => void } | null>(null);

export function useLoanCenterNav() {
  return useContext(LoanCenterNavContext);
}
