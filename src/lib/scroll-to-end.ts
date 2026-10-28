/**
 * Scrolls a chat's message list to its newest message. Unlike `scrollIntoView`, it moves only the list itself, never
 * the page behind it, so the message box doesn't get shoved off the bottom of the window as messages load.
 */
export function scrollToEnd(anchor: HTMLElement | null) {
  let el = anchor?.parentElement ?? null;
  while (el && el !== document.body) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    el = el.parentElement;
  }
}
