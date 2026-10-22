import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCompanyName, getCompanyLogo } from "@/server/settings";
import { TopBar } from "@/components/layout/top-bar";
import { ChatDockProvider } from "@/components/messaging/chat-dock-context";
import { ChatDockRoot } from "@/components/messaging/chat-dock-root";
import { MobileNavProvider } from "@/components/layout/mobile-nav";

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

  if (!session.user.onboardedAt) {
    redirect("/onboarding");
  }

  const [companyName, logo] = await Promise.all([getCompanyName(), getCompanyLogo()]);

  return (
    <ChatDockProvider>
      <MobileNavProvider>
      <div>
        <AppSidebar user={session.user} companyName={companyName} logo={logo} />
        <main className="min-h-screen lg:ml-60">
          <TopBar />
          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </main>
      </div>
      </MobileNavProvider>
      <ChatDockRoot />
    </ChatDockProvider>
  );
}
