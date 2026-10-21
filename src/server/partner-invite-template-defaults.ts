// Starting wording for the partner invite and its reminders. Copied into
// Settings → Email Templates once; after that, edit them there.

export interface PartnerInviteTemplateDefault {
  key: string;
  name: string;
  subject: string;
  body: string;
}

export const PARTNER_INVITE_TEMPLATE_DEFAULTS: PartnerInviteTemplateDefault[] = [
  {
    key: "partner_invite_initial",
    name: "Partner invite — first email",
    subject: "{{inviterName}} invited you to the Manna Lending partner program",
    body: `Hi {{firstName}},

{{inviterName}} invited you to join the Manna Lending partner program. Refer a borrower, watch every step of their loan in your own portal, and get paid when it closes.

Setting up takes about two minutes.

{{setupButton}}

This link works until {{expiryDate}}.`,
  },
  {
    key: "partner_invite_reminder_first",
    name: "Partner invite — reminder 1 (gentle)",
    subject: "Finish setting up your partner account",
    body: `Hi {{firstName}},

Your partner account is almost ready. It takes about two minutes to set up, and then your personal referral link is yours to share.

{{setupButton}}

If you have a question first, just reply to this email.`,
  },
  {
    key: "partner_invite_reminder_second",
    name: "Partner invite — reminder 2",
    subject: "Your partner invite is still waiting",
    body: `Hi {{firstName}},

Your invite to the Manna Lending partner program is still waiting for you. Once you're set up, every referral you send shows its stage and your payout in your portal.

{{setupButton}}`,
  },
  {
    key: "partner_invite_reminder_third",
    name: "Partner invite — reminder 3 (the value)",
    subject: "What a referral can pay you",
    body: `Hi {{firstName}},

A quick note on why this is worth two minutes. You earn 20% of our fee on your referral's first funded deal, with a $500 minimum, and 10% on every repeat deal that borrower closes for the next 24 months. Your client gets a straight answer in minutes, and you watch every step of their loan in your portal.

{{setupButton}}`,
  },
  {
    key: "partner_invite_reminder_final",
    name: "Partner invite — final reminder (link expiring)",
    subject: "Your partner invite link expires in {{daysLeft}} days",
    body: `Hi {{firstName}},

This is the last reminder: your link to set up your partner account stops working on {{expiryDate}}. One investor deal that funds pays you at least $500, and the same borrower keeps paying you on repeat deals for two years.

{{setupButton}}`,
  },
];
