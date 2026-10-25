import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCompanyName, getCompanyLogo } from "@/server/settings";
import { TopBar } from "@/components/layout/top-bar";
import { ChatDockProvider } from "@/components/messaging/chat-dock-context";
import { ChatDockRoot } from "@/components/messaging/chat-dock-root";
import { MobileNavProvider } from "@/components/layout/mobile-nav";
import { getMyAppearance } from "@/server/actions/appearance";
import { ThemeSync } from "@/components/appearance/theme-sync";
import { DarkModeWelcome } from "@/components/appearance/dark-mode-welcome";

// The staff app only (not the public site): lets "Add to Home Screen" on an iPhone or iPad
// install it like an app, with its own name, icon and no browser bar.
export const metadata: Metadata = {
  manifest: "/crm.webmanifest",
  icons: { apple: "/brand/app-icon-180.png" },
  appleWebApp: { capable: true, title: "Manna CRM", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#143D4A" };

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

  const [companyName, logo, appearance] = await Promise.all([getCompanyName(), getCompanyLogo(), getMyAppearance()]);
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <ChatDockProvider>
      <MobileNavProvider>
      <ThemeSync theme={appearance.theme} />
      {!appearance.welcomeSeen && <DarkModeWelcome firstName={firstName} />}
      <div className={appearance.theme === "dark" ? "dark" : undefined}>
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
