"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { setMyTheme, type UiTheme } from "@/server/actions/appearance";
import { isActionError } from "@/lib/action-result";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DarkPreview, LightPreview } from "@/components/appearance/theme-previews";
import { cn } from "@/lib/utils";

export function AppearanceCard({ initialTheme }: { initialTheme: UiTheme }) {
  const router = useRouter();
  const [theme, setTheme] = useState<UiTheme>(initialTheme);
  const [pending, startTransition] = useTransition();

  function choose(next: UiTheme) {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    startTransition(async () => {
      try {
        const result = await setMyTheme(next);
        if (isActionError(result)) throw new Error(result.error);
        router.refresh();
      } catch (err) {
        setTheme(previous);
        document.documentElement.classList.toggle("dark", previous === "dark");
        toast.error(err instanceof Error ? err.message : "Couldn't save your appearance.");
      }
    });
  }

  const options: { value: UiTheme; title: string; hint: string; preview: React.ReactNode }[] = [
    { value: "light", title: "Light", hint: "The current look", preview: <LightPreview className="h-28 w-full" /> },
    { value: "dark", title: "Dark", hint: "The new look, easier on the eyes at night", preview: <DarkPreview className="h-28 w-full" /> },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how the CRM looks for you. This applies to your account only; teammates keep their own setting.
          </CardDescription>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          Dark mode
          <Switch
            checked={theme === "dark"}
            disabled={pending}
            onCheckedChange={(on) => choose(on ? "dark" : "light")}
            aria-label="Dark mode"
          />
        </label>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="radiogroup" aria-label="Appearance" className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const selected = theme === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending}
                onClick={() => choose(o.value)}
                className={cn(
                  "relative rounded-xl border p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-2 border-foreground" : "hover:bg-muted/50"
                )}
              >
                {selected && (
                  <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                    <Check className="size-3" />
                  </span>
                )}
                {o.preview}
                <p className="mt-2 text-sm font-semibold">{o.title}</p>
                <p className="text-xs text-muted-foreground">{o.hint}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Turn it off here any time to go back to light.</p>
      </CardContent>
    </Card>
  );
}
