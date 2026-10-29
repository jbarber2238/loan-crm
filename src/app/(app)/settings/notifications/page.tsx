import { getPushSetup } from "@/server/actions/push-settings";
import { getMySoundPrefs } from "@/server/actions/notifications";
import { PushSettings } from "@/components/settings/push-settings";
import { NotificationSoundSettings } from "@/components/settings/notification-sound-settings";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [setup, sounds] = await Promise.all([getPushSetup(), getMySoundPrefs()]);
  return (
    <div className="space-y-6">
      <PushSettings setup={setup} />
      <NotificationSoundSettings initial={sounds} />
    </div>
  );
}
