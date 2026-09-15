"use client";

import { useRef, useState } from "react";
import { Bold, Italic, Underline, Link2, RemoveFormatting } from "lucide-react";

// A minimal rich-text box modeled on Gmail's own signature editor: paste in
// a fully-formatted signature (from Gmail, Word, wherever) and the HTML
// formatting comes along for the ride, or use the toolbar for basic marks.
// document.execCommand is deprecated but still the only way to drive native
// contentEditable formatting without pulling in a full editor library for
// what's a one-field, occasionally-edited box.
export function EmailSignatureEditor({ name, defaultValueHtml }: { name: string; defaultValueHtml: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValueHtml);

  function syncFromEditor() {
    setHtml(editorRef.current?.innerHTML ?? "");
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncFromEditor();
  }

  function handleLink() {
    const url = window.prompt("Link URL");
    if (url) exec("createLink", url);
  }

  // Clicking a toolbar button normally moves focus off the contentEditable
  // div first, which collapses whatever text the user had selected — by the
  // time onClick's execCommand runs, there's nothing left to apply it to.
  // Blocking the mousedown's default action keeps focus (and the selection)
  // right where it was.
  function preventFocusLoss(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 rounded-t-md border border-b-0 bg-muted/40 p-1">
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => exec("bold")}
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Bold"
        >
          <Bold className="size-4" />
        </button>
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => exec("italic")}
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Italic"
        >
          <Italic className="size-4" />
        </button>
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => exec("underline")}
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Underline"
        >
          <Underline className="size-4" />
        </button>
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={handleLink}
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Insert link"
        >
          <Link2 className="size-4" />
        </button>
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => exec("removeFormat")}
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Clear formatting"
        >
          <RemoveFormatting className="size-4" />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncFromEditor}
        onPaste={() => setTimeout(syncFromEditor, 0)}
        onBlur={syncFromEditor}
        dangerouslySetInnerHTML={{ __html: defaultValueHtml }}
        className="min-h-32 w-full max-w-sm overflow-x-auto rounded-b-md border p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring [&_img]:h-auto [&_img]:max-w-full"
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
