import { requireUser } from "@/server/auth/guards";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile{user.isAdmin ? ", company, team, and integrations" : ""}.</p>
      </div>
      <SettingsTabs isAdmin={user.isAdmin} />
      {children}
    </div>
  );
}
