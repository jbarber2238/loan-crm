import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      baseRole: "loan_officer" | "loan_officer_assistant" | "processor";
      active: boolean;
      schedulingLink: string | null;
      emailSignatureHtml: string | null;
      phone: string | null;
      nmlsNumber: string | null;
      onboardedAt: string | null;
      inboundHoursStart: string | null;
      inboundHoursEnd: string | null;
      outboundHoursStart: string | null;
      outboundHoursEnd: string | null;
      borrowerIntroEmailSubject: string | null;
      borrowerIntroEmailBody: string | null;
      borrowerIntroTextBody: string | null;
    } & DefaultSession["user"];
  }
}
