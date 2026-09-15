// Shows the sending user's real saved signature as part of the compose
// preview, read-only — every email dialog appends this at send time, so it
// should always be visible before that click, not a surprise afterward.
export function SignaturePreview({ html }: { html: string }) {
  if (!html) return null;
  return (
    <div className="rounded-md border border-dashed p-3">
      <p className="mb-1.5 text-xs text-muted-foreground">
        Your signature — added automatically when sent, not part of the editable draft above
      </p>
      <div
        className="text-sm [&_a]:underline [&_img]:h-auto [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
