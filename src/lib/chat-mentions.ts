// @-tagging in team chat. A tag is plain text in the message ("@Emily", or "@Emily Smith" when two people share a
// first name), so nothing extra is stored: the same matching below runs in the browser (autocomplete and
// highlighting) and on the server (who gets a notification), and both agree because it is this one function.

export interface MentionPerson {
  id: string;
  name: string;
}

export interface MentionRange {
  start: number;
  end: number;
  id: string;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** What gets typed after the "@": the first name, unless someone else shares it, then the full name. */
export function mentionHandle(person: MentionPerson, people: MentionPerson[]): string {
  const first = firstNameOf(person.name);
  const shared = people.filter((p) => firstNameOf(p.name).toLowerCase() === first.toLowerCase()).length > 1;
  return shared || !first ? person.name.trim() : first;
}

/** Every text that counts as tagging someone, longest first so "@Anna Lee" isn't read as "@Anna". */
function candidates(people: MentionPerson[]): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const p of people) {
    const full = p.name.trim();
    if (!full) continue;
    out.push({ id: p.id, text: full.toLowerCase() });
    const handle = mentionHandle(p, people);
    if (handle.toLowerCase() !== full.toLowerCase()) out.push({ id: p.id, text: handle.toLowerCase() });
  }
  return out.sort((a, b) => b.text.length - a.text.length);
}

/** Where each tag sits in the text. An "@" inside a word (an email address) is not a tag. */
export function findMentionRanges(body: string, people: MentionPerson[]): MentionRange[] {
  const cands = candidates(people);
  if (cands.length === 0 || !body.includes("@")) return [];
  const lower = body.toLowerCase();
  const ranges: MentionRange[] = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "@" || (i > 0 && WORD_CHAR.test(body[i - 1]))) continue;
    const hit = cands.find((c) => {
      if (!lower.startsWith(c.text, i + 1)) return false;
      const next = lower[i + 1 + c.text.length];
      return next === undefined || !WORD_CHAR.test(next);
    });
    if (!hit) continue;
    const end = i + 1 + hit.text.length;
    ranges.push({ start: i, end, id: hit.id });
    i = end - 1;
  }
  return ranges;
}

/** The distinct people tagged in the text. */
export function findMentionedIds(body: string, people: MentionPerson[]): string[] {
  return [...new Set(findMentionRanges(body, people).map((r) => r.id))];
}

/** The text cut into plain pieces and tags, in order, for showing tags highlighted. */
export function splitMentions(body: string, people: MentionPerson[]): { text: string; mentionId?: string }[] {
  const parts: { text: string; mentionId?: string }[] = [];
  let at = 0;
  for (const r of findMentionRanges(body, people)) {
    if (r.start > at) parts.push({ text: body.slice(at, r.start) });
    parts.push({ text: body.slice(r.start, r.end), mentionId: r.id });
    at = r.end;
  }
  if (at < body.length) parts.push({ text: body.slice(at) });
  return parts;
}

/**
 * The "@word" being typed at the cursor, or null. Only a tag that has just been started counts: it must begin the
 * text or follow a space, and have no space after the "@" yet (one space is allowed once it can still match a full name).
 */
export function activeMentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@]/.test(query) || (query.match(/\s/g)?.length ?? 0) > 1) return null;
  return { start: at, query };
}

/** People whose first or last name (or any part) starts with what's been typed; with nothing typed, everyone. */
export function matchMentionPeople(people: MentionPerson[], query: string): MentionPerson[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  return people.filter((p) => {
    const name = p.name.toLowerCase();
    return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q));
  });
}
