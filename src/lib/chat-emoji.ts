// Emojis offered in the chat composer. Unlike reactions (a short list the server validates), these are just
// characters typed into a message, so the list can be as big as is useful.

export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
      "😋", "😛", "😜", "🤪", "🤗", "🤭", "🤔", "🫡", "😎", "🤓", "🥳", "😏", "😌", "😴", "🤤", "😬",
      "🙄", "😮", "😲", "😳", "🥺", "😢", "😭", "😤", "😡", "🤯", "😱", "🥶", "🥵", "🤒", "🤠", "🫠",
    ],
  },
  {
    label: "Hands",
    emojis: ["👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "👏", "🙌", "🙏", "🤝", "💪", "✍️", "👋", "🫶", "🫰", "🖖", "☝️"],
  },
  {
    label: "Celebrate",
    emojis: ["🎉", "🎊", "🥂", "🍾", "🏆", "🥇", "🎯", "💯", "🔥", "⭐", "🌟", "✨", "💥", "🚀", "🎈", "🎁", "🏅", "👑", "🙌", "🤑"],
  },
  {
    label: "Deal talk",
    emojis: ["💰", "💵", "💸", "🏠", "🏡", "🏢", "🏗️", "🔑", "📈", "📉", "📊", "📝", "📄", "📎", "📞", "📧", "📅", "⏰", "⏳", "✅", "❌", "⚠️", "❗", "❓", "💼", "🤝", "🏦", "🔨", "🧾", "🔒"],
  },
  {
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💕", "💗", "💘", "💝", "💔", "❤️‍🔥"],
  },
  {
    label: "Food & fun",
    emojis: ["☕", "🍕", "🍔", "🌮", "🍟", "🌭", "🍩", "🍪", "🍰", "🍦", "🍎", "🥑", "🍺", "🍻", "🍷", "🥃", "🎸", "🎵", "🎮", "🏈", "⚽", "🏀", "⛳", "🎣"],
  },
  {
    label: "Animals & nature",
    emojis: ["🦄", "🐐", "🦈", "🐶", "🐱", "🐻", "🦁", "🐯", "🐼", "🦊", "🐸", "🐵", "🦅", "🐢", "🐙", "🦋", "🌴", "🌵", "🌻", "🌈", "☀️", "🌙", "⚡", "🌊"],
  },
];

export const RECENT_EMOJI_KEY = "chat-recent-emoji";
export const RECENT_EMOJI_MAX = 12;

/** `emoji` moved to the front of the recent list, without duplicates, capped. */
export function withRecentEmoji(recent: string[], emoji: string): string[] {
  return [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_EMOJI_MAX);
}

/** The text after typing `insert` where the cursor (or selection) is, and where the cursor ends up. */
export function insertAtSelection(text: string, start: number, end: number, insert: string): { text: string; cursor: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return { text: text.slice(0, from) + insert + text.slice(to), cursor: from + insert.length };
}
