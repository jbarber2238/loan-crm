// Wording that depends on who is sending a borrower email. A loan officer
// introduces themselves and points to their own calendar; anyone else
// (an assistant, a processor) says who they're working alongside and points
// to the loan officer's calendar instead.

export type SenderRole = "loan_officer" | "loan_officer_assistant" | "processor";

export function senderIntroLine({
  senderName,
  loanOfficerName,
  companyName,
  senderRole,
}: {
  senderName: string;
  loanOfficerName: string;
  companyName: string;
  senderRole: SenderRole | null | undefined;
}): string {
  const loanOfficerIsSender = senderRole === "loan_officer" || !loanOfficerName.trim();
  return loanOfficerIsSender
    ? `My name is ${senderName}, your loan officer here at ${companyName}.`
    : `My name is ${senderName}, and I'm working alongside ${loanOfficerName}, your loan officer here at ${companyName}.`;
}

export function loanOfficerCalendarPhrase({
  loanOfficerName,
  senderRole,
}: {
  loanOfficerName: string;
  senderRole: SenderRole | null | undefined;
}): string {
  return senderRole === "loan_officer" || !loanOfficerName.trim() ? "my calendar" : `${loanOfficerName}'s calendar`;
}
