"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadMagnetSubmission } from "@/server/actions/lead-magnet";

function toCsv(rows: LeadMagnetSubmission[]): string {
  const header = ["Name", "Email", "Phone", "Marketing Consent", "Source", "Submitted At"];
  const body = rows.map((r) => [
    r.name,
    r.email,
    r.phone,
    r.marketingConsent ? "Yes" : "No",
    r.source,
    r.createdAt.toISOString(),
  ]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...body].map((r) => r.map(escape).join(",")).join("\n");
}

function downloadCsv(rows: LeadMagnetSubmission[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lead-magnet-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sourceLabel(source: string): string {
  return source
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function LeadMagnetSubmissionsView({ submissions }: { submissions: LeadMagnetSubmission[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {submissions.length} submission{submissions.length === 1 ? "" : "s"} across every lead magnet on the
          marketing site.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={!submissions.length} onClick={() => downloadCsv(submissions)}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {submissions.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          No lead magnet submissions yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{s.phone}</TableCell>
                  <TableCell>
                    <Badge variant={s.marketingConsent ? "secondary" : "outline"}>
                      {s.marketingConsent ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>{sourceLabel(s.source)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.createdAt.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
