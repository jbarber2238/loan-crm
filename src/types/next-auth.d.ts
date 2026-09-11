import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      baseRole: "loan_officer" | "loan_officer_assistant" | "processor";
      active: boolean;
      schedulingLink: string | null;
    } & DefaultSession["user"];
  }
}
