import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanyName } from "@/server/settings";

const ERROR_MESSAGES: Record<string, string> = {
  "not-invited":
    "That Google account hasn't been invited. Ask your admin to invite you, then sign in with the exact email they invited.",
  inactive: "That account has been deactivated. Ask your admin if you need access back.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const errorMessage = typeof error === "string" ? ERROR_MESSAGES[error] : undefined;
  const session = await auth();
  if (session?.user) {
    redirect("/pipeline");
  }
  const companyName = await getCompanyName();

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{companyName} CRM</CardTitle>
          <CardDescription>Sign in with your work Google account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorMessage && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/pipeline" });
            }}
          >
            <Button type="submit" className="w-full">
              Sign in with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
