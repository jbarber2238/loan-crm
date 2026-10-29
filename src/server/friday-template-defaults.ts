// The starting wording of the Friday emails. They're copied into
// Settings → Email Templates once; after that, edit them there.

export interface FridayTemplateDefault {
  key: string;
  name: string;
  subject: string;
  body: string;
}

export const FRIDAY_TEMPLATE_DEFAULTS: FridayTemplateDefault[] = [
  {
    key: "friday_confirmation",
    name: "Friday Zoom — Confirmation (instant)",
    subject: "You're in for Friday at noon ET",
    body: `Hey {{firstName}},

You're all set for {{sessionDate}}. See It, Send It, Get Paid is a 30-minute lunch Zoom on how to spot fundable investor deals and get paid for introducing them.

{{joinButton}}
{{calendarButton}}

A calendar invite is attached too. Questions before then? Just reply to this email.

Justin`,
  },
  {
    key: "friday_morning_reminder",
    name: "Friday Zoom — Morning-of reminder (Friday 9 AM ET)",
    subject: "We're live at noon today",
    body: `Hey {{firstName}},

Quick reminder: See It, Send It, Get Paid goes live at 12:00 PM ET today.

{{joinButton}}

It's 30 minutes, and you'll leave knowing exactly what to send me and how you get paid. See you there.

Justin`,
  },
  {
    key: "friday_reminder_1h",
    name: "Friday Zoom — 1 hour before (Friday 11:00 AM ET)",
    subject: "We go live in 1 hour",
    body: `Hey {{firstName}},

See It, Send It, Get Paid starts at 12:00 PM ET, one hour from now. Grab lunch, then jump on.

{{joinButton}}

Justin`,
  },
  {
    key: "friday_reminder_10m",
    name: "Friday Zoom — 10 minutes before (Friday 11:50 AM ET)",
    subject: "Starting in 10 minutes",
    body: `Hey {{firstName}},

We start in 10 minutes. Tap the button to get in.

{{joinButton}}

See you in there,
Justin`,
  },
  {
    key: "friday_rollforward",
    name: "Friday Zoom — Rebook after a no-show (Saturday 9 AM ET)",
    subject: "You're rebooked for this Friday",
    body: `Hey {{firstName}},

Life happens. I've already moved you to {{sessionDate}}.

{{joinButton}}
{{calendarButton}}

Can't do Fridays? Just reply and tell me what works.

Justin`,
  },
  {
    key: "friday_followup",
    name: "Friday Zoom — Attended, not yet a partner (Friday 3 PM ET)",
    subject: "Thanks for joining today",
    body: `Hey {{firstName}},

Thanks for jumping on See It, Send It, Get Paid today. If you want to get paid for the deals you see, the next step takes about two minutes.

{{partnerSignupButton}}

Once you're in, you get your own referral link. Anything the borrower submits through it lands in my system with everything I need to give you an answer, and you can watch each deal move through the loan process in your portal, with your payout shown the whole way.

{{cheatSheetButton}}

Justin`,
  },
  {
    key: "friday_nudge",
    name: "Friday Zoom — Nudge, 3 days later (not yet a partner)",
    subject: "Still want in on the partner program?",
    body: `Hey {{firstName}},

Just a quick nudge. Setting up your partner account takes two minutes.

{{partnerSignupButton}}

If something's holding you up, or you have a question about how the pay works, just reply here.

Justin`,
  },
  {
    key: "friday_partner_welcome",
    name: "Friday Zoom — Welcome (the moment they become a partner)",
    subject: "Welcome aboard, {{firstName}}",
    body: `Hey {{firstName}},

You just did what most people only think about: you took action. Welcome to the Manna Lending partner program. I'm excited to work with you.

When you see a deal that passes the three questions on the Send-It Cheat Sheet, have the borrower submit it through your referral link. It collects everything I need, and you'll see every step of the loan in your portal. When we receive our payment from closing, I pay you.

{{partnerPortalButton}}
{{cheatSheetButton}}

Excited to close some deals with you.

Justin`,
  },
];
