/**
 * The embed code a partner pastes into their website: the form in an iframe,
 * plus a few lines that let the form tell the page how tall it is, so the
 * frame grows and shrinks with the form instead of leaving blank space (or
 * cutting it off). If a site blocks scripts, the frame simply keeps its
 * starting height, which still shows the first part of the form.
 */
export function buildEmbedSnippet(src: string): string {
  return (
    `<iframe id="manna-intake-frame" src="${src}" style="display:block;width:100%;max-width:720px;height:700px;margin:0 auto;border:none;" title="Loan Inquiry"></iframe>\n` +
    `<script>window.addEventListener("message",function(e){var f=document.getElementById("manna-intake-frame");` +
    `if(f&&e.source===f.contentWindow&&e.data&&e.data.type==="manna-embed-height"){f.style.height=e.data.height+"px";}});</script>`
  );
}
