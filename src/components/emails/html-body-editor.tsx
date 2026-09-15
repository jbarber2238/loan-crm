"use client";

import type { RefObject } from "react";
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

function ToolbarButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: typeof Bold;
  label: string;
}) {
  return (
    <button
      type="button"
      // Keep focus (and the current text selection) in the editable area —
      // without this, clicking the button blurs the editor first and
      // execCommand has nothing to apply the format to.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/**
 * An editable preview for an HTML email body — a small formatting toolbar
 * (bold/italic/underline/bullet/numbered list) above a contentEditable
 * area, so a processor can add real formatting (like the bullet points a
 * checklist needs) without hand-writing HTML. Uses the browser's built-in
 * execCommand for these basic commands — still supported everywhere for
 * exactly this kind of lightweight editor, and avoids pulling in a rich-text
 * library for five buttons.
 *
 * No height cap — the dialog it sits in scrolls as one piece
 * (`max-h-[85vh] overflow-y-auto` on DialogContent), so this doesn't add a
 * second, nested scroll region. The caller reads `bodyRef.current.innerHTML`
 * at send time to capture whatever was edited; `html` only matters for the
 * initial render (the `key` forces a remount when a fresh preview loads).
 */
export function HtmlBodyEditor({
  html,
  bodyRef,
  className,
}: {
  html: string;
  bodyRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  function exec(command: string) {
    bodyRef.current?.focus();
    document.execCommand(command);
  }

  return (
    <div className={cn("rounded-lg border bg-white shadow-sm", className)}>
      <div className="flex items-center gap-0.5 border-b px-2 py-1">
        <ToolbarButton onClick={() => exec("bold")} icon={Bold} label="Bold" />
        <ToolbarButton onClick={() => exec("italic")} icon={Italic} label="Italic" />
        <ToolbarButton onClick={() => exec("underline")} icon={Underline} label="Underline" />
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} icon={List} label="Bullet list" />
        <ToolbarButton onClick={() => exec("insertOrderedList")} icon={ListOrdered} label="Numbered list" />
      </div>
      <div
        key={html}
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        className="p-6 text-sm outline-none [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
