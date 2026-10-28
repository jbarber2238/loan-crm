"use client";

import { createContext, useContext } from "react";

/**
 * Lets something inside a Loan Center section switch sections (the full-screen team chat's "back"), and tells the
 * Communications tab which text thread something outside it asked to open.
 */
export const LoanCenterNavContext = createContext<{ goToTab: (value: string) => void; focusThreadId: string | null } | null>(null);

export function useLoanCenterNav() {
  return useContext(LoanCenterNavContext);
}
