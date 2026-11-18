import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { parseInlineTree, parseNoteBlocks, type InlineNode, type ListNode } from "@/lib/note-format";

const LINK_CLASS = "text-primary underline underline-offset-2 break-words";
const BARE_URL = /(https?:\/\/[^\s<>()]*[^\s<>().,;:!?])/g;

// A web address typed straight into a note becomes a link when it's shown.
function WithBareLinks({ text }: { text: string }) {
  return (
    <>
      {text.split(BARE_URL).map((piece, i) =>
        i % 2 === 1 ? (
          <a key={i} href={piece} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {piece}
          </a>
        ) : (
          <Fragment key={i}>{piece}</Fragment>
        ),
      )}
    </>
  );
}

function Inline({ nodes, inLink = false }: { nodes: InlineNode[]; inLink?: boolean }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === "text") return inLink ? <Fragment key={i}>{n.text}</Fragment> : <WithBareLinks key={i} text={n.text} />;
        if (n.type === "link") {
          return (
            <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              <Inline nodes={n.children} inLink />
            </a>
          );
        }
        const children = <Inline nodes={n.children} inLink={inLink} />;
        if (n.type === "bold") return <strong key={i}>{children}</strong>;
        if (n.type === "italic") return <em key={i}>{children}</em>;
        if (n.type === "underline") return <u key={i}>{children}</u>;
        return <s key={i}>{children}</s>;
      })}
    </>
  );
}

function Line({ text }: { text: string }) {
  return <Inline nodes={parseInlineTree(text)} />;
}

function List({ list, depth }: { list: ListNode; depth: number }) {
  const Tag = list.ordered ? "ol" : "ul";
  // Nested bullets change shape the way they do in an email: disc, circle, square.
  const bullet = ["list-disc", "list-[circle]", "list-[square]"][depth % 3];
  return (
    <Tag start={list.ordered ? list.start : undefined} className={cn("space-y-0.5 pl-5", list.ordered ? "list-decimal" : bullet)}>
      {list.items.map((item, i) => (
        <li key={i} className="break-words">
          <Line text={item.text} />
          {item.children.map((child, j) => (
            <List key={j} list={child} depth={depth + 1} />
          ))}
        </li>
      ))}
    </Tag>
  );
}

/** A note's text with its formatting shown. Plain notes look exactly as they did. */
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
                  <Line text={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote key={i} className="border-l-2 border-border pl-3 whitespace-pre-wrap text-muted-foreground">
              {block.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && "\n"}
                  <Line text={line} />
                </Fragment>
              ))}
            </blockquote>
          );
        }
        return (
          <Fragment key={i}>
            {block.lists.map((list, j) => (
              <List key={j} list={list} depth={0} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
