"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getUnreadNotificationCount } from "@/server/actions/notifications";

/** Unread count for the sidebar — refreshed on navigation and every 30 seconds. */
export function NotificationUnreadBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getUnreadNotificationCount()
        .then((n) => !cancelled && setCount(n))
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  if (count === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
