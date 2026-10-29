import { unsubscribeContactFromMarketing } from "@/server/actions/marketing-unsubscribe";

// The one-click unsubscribe that mail apps (Gmail, Apple Mail, Yahoo) call themselves when someone taps their
// "Unsubscribe" button: a POST with no page and no login. A GET just goes on to the normal confirmation page.
export async function POST(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  await unsubscribeContactFromMarketing(contactId);
  return new Response("Unsubscribed", { status: 200 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  return Response.redirect(`https://mannalendingco.com/unsubscribe/contact/${encodeURIComponent(contactId)}`, 302);
}
