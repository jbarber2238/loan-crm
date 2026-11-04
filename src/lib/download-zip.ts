/** Zips the given client-need document / deal file ids on the server and saves the result, files named as they are in the CRM. */
export async function downloadZip(ids: string[], zipName: string) {
  const res = await fetch("/api/client-need-documents/download-zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, zipName }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Download failed"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
