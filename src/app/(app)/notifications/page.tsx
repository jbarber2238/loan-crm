import { listMyNotifications } from "@/server/actions/notifications";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default async function NotificationsPage() {
  const items = await listMyNotifications();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Notifications</h1>
      <NotificationsList items={items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null }))} />
    </div>
  );
}
