import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // This app is reachable at more than one host (the custom domain and the
  // default *.vercel.app one) — without this, Auth.js can set an OAuth
  // check cookie (e.g. the PKCE verifier) under one trusted-origin
  // assumption and fail to read it back during the callback, surfacing as
  // an opaque "Configuration" / InvalidCheck error.
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Admins invite someone by creating their user row (email + role)
      // before that person has ever signed in — Auth.js's default behavior
      // refuses to auto-link a first-time Google sign-in to a pre-existing
      // user row with the same email (an anti-account-takeover guard for
      // apps with untrusted signup), which surfaces as an
      // "OAuthAccountNotLinked" loop and defeats the whole point of
      // inviting someone in advance. Safe to disable here specifically
      // because Google is the only provider and always supplies a verified
      // email — the only way an unlinked row like this exists is our own
      // admin-created invite, never an attacker.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          // gmail.readonly (used only by the lender-reply auto-check
          // feature) is a Google "restricted" scope requiring an annual paid
          // CASA security assessment to verify — not worth it for this
          // team's size. gmail.send alone is "sensitive," which only needs
          // a privacy policy + a normal (free) Google review, and — unlike
          // staying unverified — doesn't come with Google's short
          // refresh-token lifetime for Testing-mode apps.
          scope: "openid email profile https://www.googleapis.com/auth/gmail.send",
        },
      },
    }),
  ],
  callbacks: {
    // Auth.js only writes OAuth tokens to the accounts table when a NEW
    // account link is created (see events.linkAccount below) — on every
    // later sign-in of an *already*-linked account it does not, even though
    // Google (with prompt: "consent") hands back a fresh token each time.
    // Re-persist it here so a scope change actually takes effect after the
    // user re-consents, instead of silently keeping the old, narrower token.
    async signIn({ account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        await db
          .update(accounts)
          .set({
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? undefined,
            expires_at: account.expires_at ?? null,
            token_type: account.token_type ?? null,
            scope: account.scope ?? null,
            id_token: account.id_token ?? null,
            session_state:
              typeof account.session_state === "string" ? account.session_state : null,
          })
          .where(
            and(eq(accounts.provider, "google"), eq(accounts.providerAccountId, account.providerAccountId))
          );
      }
      return true;
    },
    async session({ session, user }) {
      const dbUser = user as typeof user & {
        isAdmin: boolean;
        baseRole: "loan_officer" | "loan_officer_assistant" | "processor";
        active: boolean;
        schedulingLink: string | null;
        emailSignatureHtml: string | null;
        phone: string | null;
        nmlsNumber: string | null;
        onboardedAt: Date | null;
      };
      session.user.id = dbUser.id;
      session.user.isAdmin = dbUser.isAdmin;
      session.user.baseRole = dbUser.baseRole;
      session.user.active = dbUser.active;
      session.user.schedulingLink = dbUser.schedulingLink;
      session.user.emailSignatureHtml = dbUser.emailSignatureHtml;
      session.user.phone = dbUser.phone;
      session.user.nmlsNumber = dbUser.nmlsNumber;
      session.user.onboardedAt = dbUser.onboardedAt?.toISOString() ?? null;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      const shouldBeAdmin = adminEmails.includes(user.email.toLowerCase());
      if (shouldBeAdmin) {
        await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
      }
    },
    async linkAccount({ user, account, profile }) {
      if (account.provider === "google" && user.id) {
        // Admins can invite a user (email + role) before they've ever signed
        // in — backfill their real name/photo from Google on first link.
        await db
          .update(users)
          .set({
            googleId: account.providerAccountId,
            name: user.name ?? profile.name ?? undefined,
            image: user.image ?? profile.image ?? undefined,
          })
          .where(eq(users.id, user.id));
      }
    },
  },
});
