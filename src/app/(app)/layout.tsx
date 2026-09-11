import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCompanyName } from "@/server/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  if (!session.user.active) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          Your account has been deactivated. Contact an admin for access.
        </p>
      </div>
    );
  }

  const companyName = await getCompanyName();

  return (
    <div>
      <AppSidebar user={session.user} companyName={companyName} />
      <main className="ml-60 min-h-screen p-4 md:p-6">{children}</main>
    </div>
  );
}
