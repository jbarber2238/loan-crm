// The reactions offered in team chat. The server only accepts these, so the list
// is the single source for both the picker and validation.

/** Shown right on the picker, one tap away. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🔥", "👀"] as const;

export const REACTION_GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Affirm", emojis: ["👍", "✅", "👌", "🙌", "👏", "💯", "🙏", "🫡", "🤝", "💪"] },
  { label: "Feelings", emojis: ["❤️", "😂", "🤣", "😍", "🥳", "😮", "🤯", "😬", "😢", "🤔"] },
  { label: "Deal talk", emojis: ["💰", "🏠", "🔑", "🚀", "🏆", "📈", "🎯", "⏰", "🔥", "👀"] },
  { label: "Just for fun", emojis: ["🦄", "🍕", "☕", "🌮", "🍻", "🐐", "🎸", "🌴", "🦈", "🧠"] },
];

export const ALLOWED_REACTIONS: ReadonlySet<string> = new Set([
  ...QUICK_REACTIONS,
  ...REACTION_GROUPS.flatMap((g) => g.emojis),
]);
