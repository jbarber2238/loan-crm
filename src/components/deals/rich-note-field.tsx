"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readNoteFrom, renderNoteInto } from "@/lib/note-editor-dom";

type Command = "bold" | "insertUnorderedList" | "insertOrderedList";

/**
 * A note box where bold and lists show as you type. Underneath, the note is still plain text
 * (**bold**, • bullets, 1. numbers), so saving, old notes and the AI note tools are unchanged.
 */
export function RichNoteField({
  value,
  onChange,
  textareaRef,
  rows = 4,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Lets the parent focus the box (kept under the old name so callers read the same). */
  textareaRef?: React.RefObject<HTMLDivElement | null>;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const own = useRef<HTMLDivElement | null>(null);
  const editor = textareaRef ?? own;
  // What the editor last told the parent. A different `value` means the parent changed it (template, pulled context, cleared after posting).
  const synced = useRef<string | null>(null);
  const [active, setActive] = useState<Record<Command, boolean>>({ bold: false, insertUnorderedList: false, insertOrderedList: false });
  const empty = value.trim() === "";

  useEffect(() => {
    const el = editor.current;
    if (!el || synced.current === value) return;
    renderNoteInto(el, value);
    synced.current = value;
  }, [value, editor]);

  useEffect(() => {
    if (autoFocus) editor.current?.focus();
  }, [autoFocus, editor]);

  // Keep the toolbar's lit buttons in step with where the cursor is.
  useEffect(() => {
    function refresh() {
      const el = editor.current;
      const sel = document.getSelection();
      if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
      setActive({
        bold: document.queryCommandState("bold"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
      });
    }
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [editor]);

  function emit() {
    const el = editor.current;
    if (!el) return;
    const text = readNoteFrom(el);
    synced.current = text;
    onChange(text);
  }

  function run(command: Command) {
    editor.current?.focus();
    document.execCommand(command);
    emit();
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Paste as plain words so nothing from another page's styling comes along.
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    emit();
  }

  // Buttons take the click without pulling the cursor out of the note.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const tool = (command: Command, label: string, title: string, icon: React.ReactNode) => (
    <Button
      type="button"
      size="sm"
      variant={active[command] ? "secondary" : "outline"}
      title={title}
      aria-label={label}
      aria-pressed={active[command]}
      onMouseDown={keepFocus}
      onClick={() => run(command)}
    >
      {icon}
    </Button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1" role="toolbar" aria-label="Text formatting">
        {tool("bold", "Bold", "Bold (Ctrl/⌘ B)", <Bold className="size-3.5" />)}
        {tool("insertUnorderedList", "Bulleted list", "Bulleted list", <List className="size-3.5" />)}
        {tool("insertOrderedList", "Numbered list", "Numbered list", <ListOrdered className="size-3.5" />)}
      </div>
      <div className="relative">
        <div
          ref={editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder ?? "Note"}
          onInput={emit}
          onPaste={onPaste}
          style={{ minHeight: `${rows * 1.5 + 1}rem` }}
          className={cn(
            "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none md:text-sm dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_b]:font-semibold",
          )}
        />
        {empty && placeholder && <span className="pointer-events-none absolute top-2 left-2.5 text-base text-muted-foreground md:text-sm">{placeholder}</span>}
      </div>
    </div>
  );
}
