import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getCompanyName } from "@/server/settings";
import { originFromHeaders } from "@/server/mcp/oauth/config";
import { checkAuthorizeRequest } from "@/server/mcp/oauth/flow";
import { dbOAuthStore } from "@/server/mcp/oauth/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decideAuthorization } from "./actions";

// OAuth consent screen for the read-only Claude connector. Sign-in is the CRM's
// normal Google sign-in; only an active admin gets as far as the Approve button.

function Shell({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {children && <CardContent className="space-y-4">{children}</CardContent>}
      </Card>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) params[key] = typeof value === "string" ? value : undefined;

  const origin = originFromHeaders(await headers());
  const check = await checkAuthorizeRequest(params, dbOAuthStore, origin);
  if (!check.ok) {
    if ("redirectTo" in check) redirect(check.redirectTo);
    return <Shell title="Can't connect" description={check.fatal} />;
  }

  const session = await auth();
  if (!session?.user || !session.user.active) {
    const back = `/oauth/authorize?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)).toString()}`;
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(back)}`);
  }
  const companyName = await getCompanyName();
  if (!session.user.isAdmin) {
    return (
      <Shell
        title="Admins only"
        description={`Only a ${companyName} admin can connect an app to the loan pipeline. You're signed in as ${session.user.email}. Ask an admin to connect it.`}
      />
    );
  }

  const { client, request } = check;
  const redirectHost = new URL(request.redirectUri).host;

  return (
    <Shell title={`Connect to ${companyName} CRM`} description={`${client.clientName} is asking for read-only access to your loan pipeline.`}>
      <p className="text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{session.user.name ?? session.user.email}</span>. This will be recorded as your connection.
      </p>
      <div className="space-y-3 rounded-md border p-3 text-sm">
        <div>
          <p className="font-medium">It can see</p>
          <ul className="ml-4 list-disc text-muted-foreground">
            <li>Open loans: borrower, property, lender, stage, dates and team</li>
            <li>Client needs, and the names and review status of uploaded documents</li>
            <li>Recent activity: stage changes, uploads, notes and logged emails</li>
          </ul>
        </div>
        <div>
          <p className="font-medium">It cannot</p>
          <ul className="ml-4 list-disc text-muted-foreground">
            <li>Change, create or delete anything, send email or text, or start any automation</li>
            <li>See SSNs, bank or account numbers, dates of birth, or what is inside any document</li>
          </ul>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        After you approve, you&apos;ll be sent back to <span className="font-medium text-foreground">{redirectHost}</span>. If you don&apos;t recognise that address, cancel. You can disconnect it any time in Settings → Integrations.
      </p>
      <form action={decideAuthorization} className="flex gap-2">
        <input type="hidden" name="client_id" value={request.clientId} />
        <input type="hidden" name="redirect_uri" value={request.redirectUri} />
        <input type="hidden" name="response_type" value="code" />
        <input type="hidden" name="code_challenge" value={request.codeChallenge} />
        <input type="hidden" name="code_challenge_method" value="S256" />
        <input type="hidden" name="state" value={request.state ?? ""} />
        <input type="hidden" name="resource" value={request.resource} />
        <Button type="submit" name="decision" value="approve" className="flex-1">
          Approve
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
          Cancel
        </Button>
      </form>
    </Shell>
  );
}
