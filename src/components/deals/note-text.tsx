import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { parseInline, parseNoteBlocks } from "@/lib/note-format";

function Inline({ line }: { line: string }) {
  return (
    <>
      {parseInline(line).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <Fragment key={i}>{part.text}</Fragment>))}
    </>
  );
}

/** A note's text with its bold, bullets and numbered lists shown. Plain notes look exactly as they did. */
export function NoteText({ body, className }: { body: string; className?: string }) {
  const blocks = parseNoteBlocks(body);
  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      {blocks.map((block, i) => {
        if (block.kind === "text") {
          return (
            <p key={i} className="whitespace-pre-wrap">
              {block.text.split("\n").map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && "\n"}
                  <Inline line={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        const Tag = block.kind === "ul" ? "ul" : "ol";
        return (
          <Tag
            key={i}
            start={block.kind === "ol" ? block.start : undefined}
            className={cn("space-y-0.5 pl-5", block.kind === "ul" ? "list-disc" : "list-decimal")}
          >
            {block.items.map((item, j) => (
              <li key={j} className="break-words">
                <Inline line={item} />
              </li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
