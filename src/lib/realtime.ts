"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase Realtime is used only as a "something changed" signal and for
// typing indicators — message content itself is always fetched through our
// own authenticated server actions, so the (public) anon key never exposes
// any chat data. If the env vars aren't set, this returns null and callers
// fall back to plain polling.
let client: SupabaseClient | null | undefined;

export function getRealtimeClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } }) : null;
  return client;
}

export const roomChannelName = (roomId: string) => `team-chat-room:${roomId}`;
export const GLOBAL_CHAT_CHANNEL = "team-chat-global";
