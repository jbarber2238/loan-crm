"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContactQuickActions } from "@/components/messaging/contact-quick-actions";
import type { ContactType, DirectoryContact } from "@/server/actions/messages";

const CONTACT_TYPES: ContactType[] = ["Borrower", "Insurance", "Title", "Lender Rep", "Referral Partner", "Other"];

function consentLabel(consent: boolean | null): { text: string; className: string } {
  if (consent === true) return { text: "Yes", className: "text-green-700 dark:text-green-400" };
  if (consent === false) return { text: "No", className: "text-destructive" };
  return { text: "Unknown", className: "text-muted-foreground" };
}

function toCsv(contacts: DirectoryContact[]): string {
  const header = ["Name", "Type", "Phone", "Email", "Text/Email Consent", "Context"];
  const rows = contacts.map((c) => [
    c.name,
    c.contactType,
    c.phone,
    c.email ?? "",
    c.contactType === "Borrower" ? consentLabel(c.consent).text : "N/A",
    c.subtitle,
  ]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

function downloadCsv(contacts: DirectoryContact[]) {
  const csv = toCsv(contacts);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contacts-directory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ContactDirectoryView({ contacts }: { contacts: DirectoryContact[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContactType | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (typeFilter !== "all" && c.contactType !== typeFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q);
    });
  }, [contacts, query, typeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, or email…"
          className="max-w-xs"
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ContactType | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CONTACT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => downloadCsv(filtered)}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Text/Email Consent</th>
              <th className="px-3 py-2 font-medium">Context</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No contacts match.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const consent = consentLabel(c.consent);
              return (
                <tr key={c.key} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border px-1.5 py-0.5 text-xs text-muted-foreground">{c.contactType}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      {c.phone}
                      <ContactQuickActions phone={c.phone} name={c.name} contactType={c.contactType} dealId={c.dealId} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className={`px-3 py-2 font-medium ${c.contactType === "Borrower" ? consent.className : "text-muted-foreground"}`}>
                    {c.contactType === "Borrower" ? consent.text : "N/A"}
                  </td>
                  <td className="max-w-64 truncate px-3 py-2 text-muted-foreground">{c.subtitle}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
