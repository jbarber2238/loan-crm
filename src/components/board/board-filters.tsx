"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LOAN_CATEGORIES } from "@/lib/labels";

interface Option {
  value: string;
  label: string;
}

export function BoardFilters({
  loanOfficers,
  processors,
  lenders,
}: {
  loanOfficers: Option[];
  processors: Option[];
  lenders: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = ["loanOfficerId", "processorId", "lenderId", "category"].some((key) =>
    searchParams.has(key)
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={searchParams.get("loanOfficerId") ?? "all"}
        onValueChange={(v) => setParam("loanOfficerId", v)}
      >
        <SelectTrigger className="w-40"><SelectValue placeholder="Loan Officer" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All loan officers</SelectItem>
          {loanOfficers.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("processorId") ?? "all"}
        onValueChange={(v) => setParam("processorId", v)}
      >
        <SelectTrigger className="w-40"><SelectValue placeholder="Processor" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All processors</SelectItem>
          {processors.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("lenderId") ?? "all"}
        onValueChange={(v) => setParam("lenderId", v)}
      >
        <SelectTrigger className="w-40"><SelectValue placeholder="Lender" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All lenders</SelectItem>
          {lenders.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("category") ?? "all"}
        onValueChange={(v) => setParam("category", v)}
      >
        <SelectTrigger className="w-48"><SelectValue placeholder="Loan Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {LOAN_CATEGORIES.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
