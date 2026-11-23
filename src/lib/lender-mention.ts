// Spotting a lender's name in free text, and taking it back out. A client need's name and instructions are read by the
// borrower, who must not learn which lender is funding the loan, so the lender lives on an internal tag instead.

export interface LenderRef {
  id: string;
  name: string;
}

// Words that say what kind of company it is, not which one: "Dynamo Capital" is "Dynamo" in conversation.
const GENERIC_WORDS = new Set([
  "capital",
  "lending",
  "funding",
  "mortgage",
  "financial",
  "finance",
  "solutions",
  "group",
  "bank",
  "loans",
  "llc",
  "inc",
  "corp",
  "co",
]);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);

/**
 * The ways a lender gets named: the full name, the name without its company-type words ("Dynamo Capital" → "Dynamo"),
 * and initials for a name of three or more words ("Lend Investor Capital" → "LIC").
 */
export function lenderAliases(name: string): { text: string; caseSensitive: boolean }[] {
  const all = words(name);
  if (!all.length) return [];
  const aliases: { text: string; caseSensitive: boolean }[] = [{ text: all.join(" "), caseSensitive: false }];

  const core = [...all];
  while (core.length > 1 && GENERIC_WORDS.has(core[core.length - 1].toLowerCase().replace(/[.,]/g, ""))) core.pop();
  const short = core.join(" ");
  // A short form has to be distinctive on its own: at least three characters, and not itself a company-type word.
  if (core.length < all.length && short.length >= 3 && !GENERIC_WORDS.has(short.toLowerCase())) {
    aliases.push({ text: short, caseSensitive: false });
  }

  // Initials only match in capitals, so "LIC" is found but the "lic" in "license" never is.
  if (all.length >= 3 && all.every((w) => /^[A-Za-z]/.test(w))) {
    aliases.push({ text: all.map((w) => w[0].toUpperCase()).join(""), caseSensitive: true });
  }
  return aliases;
}

// Whole words only, and forgiving of a plural or possessive on any word ("Lend Investors Capital", "Dynamo's").
function aliasPattern(alias: string): string {
  return words(alias)
    .map((w) => `${escapeRegExp(w)}(?:'?s)?`)
    .join("\\s+");
}

function aliasRegExp(alias: { text: string; caseSensitive: boolean }, global = false): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${aliasPattern(alias.text)}(?![A-Za-z0-9])`, `${alias.caseSensitive ? "" : "i"}${global ? "g" : ""}`);
}

/** The lender named in the text, if any. When more than one is named, the longest match wins. */
export function findLenderMention<T extends LenderRef>(text: string, lenders: T[]): T | null {
  let best: { lender: T; length: number } | null = null;
  for (const lender of lenders) {
    for (const alias of lenderAliases(lender.name)) {
      const match = aliasRegExp(alias).exec(text);
      if (match && (!best || match[0].length > best.length)) best = { lender, length: match[0].length };
    }
  }
  return best?.lender ?? null;
}

/** True when the text names this lender in any of its usual forms. */
export function mentionsLender(text: string, lenderName: string): boolean {
  return lenderAliases(lenderName).some((alias) => aliasRegExp(alias).test(text));
}

/** A need's title with the lender's name taken out: "ACH Authorization (Dynamo Capital)" → "ACH Authorization". */
export function stripLenderFromTitle(title: string, lenderName: string): string {
  let out = title;
  // Longest form first, so "Dynamo Capital" goes as a whole rather than leaving "Capital" behind.
  for (const alias of [...lenderAliases(lenderName)].sort((a, b) => b.text.length - a.text.length)) {
    out = out.replace(aliasRegExp(alias, true), "");
  }
  return out
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—:,/]+|[\s\-–—:,/]+$/g, "")
    .trim();
}

/** Borrower instructions with the lender's name swapped for "the lender". */
export function replaceLenderInText(text: string, lenderName: string): string {
  let out = text;
  for (const alias of [...lenderAliases(lenderName)].sort((a, b) => b.text.length - a.text.length)) {
    const pattern = new RegExp(
      `(?:\\b(the)\\s+)?(?<![A-Za-z0-9])${aliasPattern(alias.text)}(?![A-Za-z0-9])`,
      `g${alias.caseSensitive ? "" : "i"}`
    );
    out = out.replace(pattern, (match) => (/'s$/i.test(match) ? "the lender's" : "the lender"));
  }
  // "the lender" opening a sentence takes a capital.
  return out.replace(/(^|[.!?]\s+)the lender/g, (_, lead: string) => `${lead}The lender`);
}
