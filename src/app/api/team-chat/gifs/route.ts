import { auth } from "@/server/auth";
import { isGifUrl } from "@/lib/chat-gif";

// Searches Giphy for the chat's GIF picker. The key stays on the server (GIPHY_API_KEY), and only signed-in
// team members can use it. Without a key it says so, and the picker shows how to turn GIFs on.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.active) return new Response("Unauthorized", { status: 401 });

  const key = process.env.GIPHY_API_KEY;
  if (!key) return Response.json({ configured: false, gifs: [] });

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  const endpoint = q ? "search" : "trending";
  const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg");
  url.searchParams.set("bundle", "messaging_non_clips");
  if (q) url.searchParams.set("q", q);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 300 } });
    if (!res.ok) return Response.json({ configured: true, gifs: [], error: res.status === 429 ? "busy" : "failed" });
    const json = (await res.json()) as {
      data?: { id: string; title?: string; images?: { fixed_height?: { url?: string }; fixed_height_small?: { url?: string } } }[];
    };
    const gifs = (json.data ?? []).flatMap((g) => {
      const send = g.images?.fixed_height?.url;
      const preview = g.images?.fixed_height_small?.url ?? send;
      if (!send || !preview || !isGifUrl(send) || !isGifUrl(preview)) return [];
      return [{ id: g.id, title: g.title ?? "GIF", preview, send }];
    });
    return Response.json({ configured: true, gifs });
  } catch {
    return Response.json({ configured: true, gifs: [], error: "failed" });
  }
}
