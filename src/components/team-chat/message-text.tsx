import { Fragment, type ReactNode } from "react";
import { linkify } from "@/lib/linkify";
import { splitMentions, type MentionPerson } from "@/lib/chat-mentions";
import { cn } from "@/lib/utils";

/** A message's text with links clickable and @tags highlighted (the tag of the person reading it stands out more). */
export function MessageText({
  text,
  people,
  currentUserId,
  onPrimary,
}: {
  text: string;
  people: MentionPerson[];
  currentUserId?: string;
  /** Sitting on the solid brand-colour bubble of my own message, where the usual highlight would vanish. */
  onPrimary?: boolean;
}) {
  const nodes: ReactNode[] = linkify(text).map((node, i) => {
    if (typeof node !== "string") return node;
    return (
      <Fragment key={i}>
        {splitMentions(node, people).map((part, j) =>
          part.mentionId ? (
            <span
              key={j}
              className={cn(
                "rounded px-1 font-medium",
                onPrimary ? "bg-white/25" : "bg-primary/10 text-primary",
                part.mentionId === currentUserId && !onPrimary && "bg-primary/20 font-semibold"
              )}
            >
              {part.text}
            </span>
          ) : (
            part.text
          )
        )}
      </Fragment>
    );
  });
  return <>{nodes}</>;
}
