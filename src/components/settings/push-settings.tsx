"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription, sendTestPush, setPushPreference, type PushSetup } from "@/server/actions/push-settings";

type DeviceState = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectState(): Promise<DeviceState> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iPhones only allow push for a site that has been added to the home screen.
  if (ios && !standalone) return Promise.resolve("needs-install");
  if (!supported) return Promise.resolve("unsupported");
  if (Notification.permission === "denied") return Promise.resolve("blocked");
  if (Notification.permission !== "granted") return Promise.resolve("off");
  return navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => reg.pushManager.getSubscription())
    .then((sub) => (sub ? "on" : "off") as DeviceState)
    .catch(() => "off" as DeviceState);
}

export function PushSettings({ setup }: { setup: PushSetup }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [categories, setCategories] = useState(setup.categories);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    detectState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  function enable() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          toast.error("Notifications weren't allowed on this device.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(setup.publicKey) }));
        const json = sub.toJSON();
        const saved = await savePushSubscription({ endpoint: json.endpoint ?? "", keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } }, navigator.userAgent);
        if ("error" in saved) throw new Error(saved.error);
        setState("on");
        toast.success("Notifications are on for this device");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't turn notifications on");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        toast.success("Notifications are off for this device");
      } catch {
        toast.error("Couldn't turn notifications off");
      }
    });
  }

  function test() {
    startTransition(async () => {
      const r = await sendTestPush();
      if (r.sent > 0) toast.success(`Sent to ${r.sent} ${r.sent === 1 ? "device" : "devices"}. It should arrive in a few seconds.`);
      else toast.error("No device received it. Turn notifications on for this device first.");
    });
  }

  function change(id: string, on: boolean) {
    const previous = categories;
    setCategories(categories.map((c) => (c.id === id ? { ...c, on } : c)));
    startTransition(async () => {
      const r = await setPushPreference(id, on);
      if ("error" in r) {
        setCategories(previous);
        toast.error(r.error);
      } else toast.success("Saved");
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <BellRing className="size-4" />
          <h2 className="text-base font-semibold">Push notifications on this device</h2>
          {state === "on" && <Badge variant="success">On</Badge>}
          {state === "off" && <Badge variant="outline">Off</Badge>}
          {state === "blocked" && <Badge variant="destructive">Blocked</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Get an alert on your phone or computer when something needs you, even when the CRM isn&apos;t open. You choose which kinds below. Each device is turned on separately
          {setup.devices > 0 ? ` (${setup.devices} ${setup.devices === 1 ? "device is" : "devices are"} on right now)` : ""}.
        </p>

        {state === "needs-install" && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Smartphone className="size-4" /> On an iPhone, add the CRM to your home screen first
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Open this page in Safari.</li>
              <li>Tap the Share button, then Add to Home Screen, then Add.</li>
              <li>Open the CRM from the new icon on your home screen and come back to this page.</li>
              <li>Tap Turn on notifications. The icon will also show a number when things are waiting.</li>
            </ol>
          </div>
        )}
        {state === "unsupported" && <p className="text-sm text-muted-foreground">This browser can&apos;t receive push notifications. Try Chrome, Edge, Firefox or Safari 16.4 or newer.</p>}
        {state === "blocked" && (
          <p className="text-sm text-muted-foreground">Notifications are blocked for this site. Allow them in your browser&apos;s site settings (the icon at the left of the address bar), then reload this page.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {state === "off" && (
            <Button onClick={enable} disabled={pending}>
              Turn on notifications
            </Button>
          )}
          {state === "on" && (
            <>
              <Button variant="outline" onClick={test} disabled={pending}>
                Send me a test
              </Button>
              <Button variant="ghost" onClick={disable} disabled={pending}>
                Turn off for this device
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="text-base font-semibold">What to alert me about</h2>
          <p className="text-sm text-muted-foreground">These apply to push on every one of your devices. Everything still appears in the bell inside the CRM, and the number on the tab and icon counts it all.</p>
        </div>
        <ul className="divide-y">
          {categories.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-4 py-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.description}</p>
              </div>
              <input type="checkbox" role="switch" aria-label={c.label} className="mt-1 size-4 shrink-0" checked={c.on} disabled={pending} onChange={(e) => change(c.id, e.target.checked)} />
            </li>
          ))}
        </ul>
        {!setup.isAdmin && <p className="text-xs text-muted-foreground">You&apos;re only alerted about deals you&apos;re assigned to and messages sent to you.</p>}
      </section>
    </div>
  );
}
