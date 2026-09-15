"use client";

import { useMemo, useState, type RefObject } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EmailTemplateToken } from "@/lib/email-template-tokens";

/**
 * A searchable, alphabetized dropdown of merge fields — search "property
 * address", click the match, and {{propertyAddress}} is spliced into the
 * target input/textarea at the cursor position. Used everywhere a template
 * subject/body can reference deal data, instead of expecting the field name
 * to be typed from memory.
 */
export function MergeFieldPicker({
  tokens,
  targetRef,
  value,
  onChange,
}: {
  tokens: EmailTemplateToken[];
  targetRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...tokens].sort((a, b) => a.key.localeCompare(b.key)), [tokens]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => t.key.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [sorted, query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function insert(key: string) {
    const el = targetRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      onChange(value + token);
      handleOpenChange(false);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    handleOpenChange(false);
    // Value hasn't re-rendered into the DOM yet — wait a tick, then put the
    // cursor right after the token that was just inserted, not the field end.
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground">
          <Search className="size-3" />
          Insert field
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            placeholder="Search fields…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filtered.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => insert(t.key)}
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <code className="text-xs font-medium">{`{{${t.key}}}`}</code>
              <span className="text-[11px] text-muted-foreground">{t.description}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No matching fields.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
