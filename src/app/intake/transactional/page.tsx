import { redirect } from "next/navigation";

// The request form moved to /transactional/request; keep old links working.
export default async function LegacyTransactionalIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { submitted } = await searchParams;
  redirect(submitted === "1" ? "/transactional/request?submitted=1" : "/transactional/request");
}
