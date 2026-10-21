import { requireUser } from "@/server/auth/guards";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await requireUser();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile{user.isAdmin ? ", company, team, and integrations" : ""}.</p>
      </div>
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        <SettingsNav isAdmin={user.isAdmin} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
