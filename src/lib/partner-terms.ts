// The partner program terms: one versioned document, accepted by click in the
// signup wizard (click-through, not a signed document). Changing the text means
// bumping TERMS_VERSION, which prompts every partner to accept again at their
// next sign-in. Earned payouts are never affected by a terms change.

export const TERMS_VERSION = "2026-10-v2";

export interface TermsSection {
  heading: string;
  paragraphs: string[];
}

export const PARTNER_TERMS: TermsSection[] = [
  {
    heading: "The arrangement",
    paragraphs: [
      "Manna Lending is a trade name of VESBA Creative Capital, a Michigan limited liability company (\"Manna\"). Under these terms, Manna pays you a referral fee when a borrower you refer completes a business-purpose loan with Manna.",
    ],
  },
  {
    heading: "How you're paid",
    paragraphs: [
      "First loan: you earn 20% of the broker fee Manna collects on a referred borrower's first funded loan. Manna's minimum broker fee is $2,500, so your minimum on a first loan is $500.",
      "Tier 2 (25%): you earn 25% instead of 20% once three of your referred borrowers' first loans have funded within a trailing 12 months. Once earned, tier 2 is held for 12 months. After that, it continues as long as at least two first loans funded in the trailing 12 months, and returns to 20% if not. We'll warn you 90 days before that can happen. The rate that applies is the one in effect when the borrower's first loan funds.",
      "Repeat loans: for 24 months after a referred borrower's first loan funds, you earn 10% of the broker fee on that borrower's later funded loans. We recognize the same borrower when at least two of these match: their name, their email, their company name.",
      "The \"broker fee\" is the origination fee Manna actually collects on the loan. It does not include third-party, lender, appraisal or processing fees.",
    ],
  },
  {
    heading: "When you're paid",
    paragraphs: [
      "We pay by ACH within 5 business days after Manna receives its broker fee from the closing, and only on fees Manna actually collects. We don't pay on a closing that hasn't produced a collected fee. To be paid, we need your payment details and a completed W-9; we'll ask for both when your first referral closes.",
      "Referral income over $600 in a year is reported to the IRS on a Form 1099-NEC.",
    ],
  },
  {
    heading: "Your role",
    paragraphs: [
      "You are an independent contractor, not an employee, agent or representative of Manna. You can't speak for Manna, quote rates, make commitments, or bind Manna to anything. Whether to make any loan, and on what terms, is Manna's and its lenders' decision alone, and nothing here obligates Manna to fund a particular referral.",
      "You're responsible for your own taxes and for following the laws that apply to you, including any brokerage or real estate board rules on receiving referral compensation. If you're licensed or belong to a brokerage or board, it's on you to follow their rules on referral fees, including any disclosure or approval they require. Keep borrower information you receive confidential and use it only to help the borrower get a loan through Manna.",
    ],
  },
  {
    heading: "Ending the arrangement",
    paragraphs: [
      "Either of us may end this arrangement at any time by telling the other in writing (email is fine). Payouts already earned always survive: trailing payouts on borrowers who have already funded continue for their full 24 months, and any payout on a loan that funded before the arrangement ended is still paid when the fee is collected.",
    ],
  },
  {
    heading: "Changes and governing law",
    paragraphs: [
      "Manna may update these terms. You'll be asked to accept the new version the next time you sign in, and a change never reduces a payout you've already earned. These terms are governed by Michigan law.",
    ],
  },
];
