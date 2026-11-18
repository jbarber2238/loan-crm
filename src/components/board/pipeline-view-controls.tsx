"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutList, Columns3 } from "lucide-react";
import { savePipelinePrefs } from "@/server/actions/pipeline-prefs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIPELINE_SORTS, type PipelineScope, type PipelineSort, type PipelineView } from "@/lib/pipeline-list";
import { cn } from "@/lib/utils";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            value === o.value ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The Pipeline's own toggles. Each change is saved to the person's account straight away, so the page opens the way
// they last left it.
export function PipelineViewControls({ view, scope, sort }: { view: PipelineView; scope: PipelineScope; sort: PipelineSort }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState({ view, scope, sort });
  const [synced, setSynced] = useState({ view, scope, sort });
  // A fresh page load from the server replaces what we are showing.
  if (synced.view !== view || synced.scope !== scope || synced.sort !== sort) {
    setSynced({ view, scope, sort });
    setLocal({ view, scope, sort });
  }

  function save(patch: Partial<{ view: PipelineView; scope: PipelineScope; sort: PipelineSort }>) {
    setLocal((prev) => ({ ...prev, ...patch }));
    startTransition(async () => {
      try {
        await savePipelinePrefs(patch);
        router.refresh();
      } catch (err) {
        setLocal({ view, scope, sort });
        toast.error(err instanceof Error ? err.message : "Couldn't save that setting.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        label="Pipeline view"
        value={local.view}
        disabled={pending}
        onChange={(v) => save({ view: v })}
        options={[
          { value: "board", label: "Board", icon: <Columns3 className="size-4" /> },
          { value: "list", label: "List", icon: <LayoutList className="size-4" /> },
        ]}
      />
      <Segmented
        label="Which deals"
        value={local.scope}
        disabled={pending}
        onChange={(v) => save({ scope: v })}
        options={[
          { value: "all", label: "All deals" },
          { value: "mine", label: "My deals" },
        ]}
      />
      {local.view === "list" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={local.sort} onValueChange={(v) => save({ sort: v as PipelineSort })}>
            <SelectTrigger className="w-44" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
