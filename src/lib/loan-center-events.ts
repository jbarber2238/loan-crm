// Window events the deal's header banner uses to steer the Loan Center (which lives below it, in its own client tree).

/** Detail: { tab: string }. Switches the Loan Center to that section. */
export const LOAN_CENTER_GOTO_EVENT = "crm:loan-center-goto";

/** Asks the Notes tab to start an end-of-day update. Also left in sessionStorage (below) for when Notes isn't mounted yet. */
export const COMPOSE_UPDATE_EVENT = "crm:compose-update";
export const COMPOSE_UPDATE_KEY = "crm.compose-update";
