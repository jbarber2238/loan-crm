import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanyName } from "@/server/settings";

export default async function SignInPage() {
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
        <CardContent>
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
