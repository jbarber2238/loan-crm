"use client";

import { useRef } from "react";
import { Bold, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { continueList, toggleBold, toggleList, type EditResult } from "@/lib/note-format";

/**
 * A note box with a small toolbar: bold, bullets, numbered list. The text underneath stays plain
 * (**bold**, • bullets, 1. numbers), so it reads fine anywhere and old notes need no conversion.
 */
export function RichNoteField({
  value,
  onChange,
  textareaRef,
  rows,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const inner = textareaRef ?? own;

  function apply(edit: (text: string, start: number, end: number) => EditResult) {
    const el = inner.current;
    if (!el) return;
    const result = edit(el.value, el.selectionStart, el.selectionEnd);
    onChange(result.text);
    // Put the selection back once React has written the new text.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      apply(toggleBold);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.nativeEvent.isComposing) {
      const el = e.currentTarget;
      if (el.selectionStart !== el.selectionEnd) return;
      const result = continueList(el.value, el.selectionStart);
      if (result) {
        e.preventDefault();
        onChange(result.text);
        requestAnimationFrame(() => el.setSelectionRange(result.start, result.end));
      }
    }
  }

  // Buttons take the click without pulling focus out of the text box.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1" role="toolbar" aria-label="Text formatting">
        <Button type="button" size="sm" variant="outline" title="Bold (Ctrl/⌘ B)" aria-label="Bold" onMouseDown={keepFocus} onClick={() => apply(toggleBold)}>
          <Bold className="size-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" title="Bulleted list" aria-label="Bulleted list" onMouseDown={keepFocus} onClick={() => apply((t, s, e) => toggleList(t, s, e, "ul"))}>
          <List className="size-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" title="Numbered list" aria-label="Numbered list" onMouseDown={keepFocus} onClick={() => apply((t, s, e) => toggleList(t, s, e, "ol"))}>
          <ListOrdered className="size-3.5" />
        </Button>
      </div>
      <Textarea ref={inner} rows={rows} placeholder={placeholder} value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
    </div>
  );
}
