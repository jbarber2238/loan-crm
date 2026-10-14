"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LenderContact } from "@/lib/transactional-lender-contacts";

/**
 * More people at the same lender. Everyone listed here is on every email sent
 * to the lender, along with the main contact. Submitted as one JSON field with
 * the rest of the lender form.
 */
export function AdditionalContactsEditor({ idPrefix, initial }: { idPrefix: string; initial: LenderContact[] }) {
  const [contacts, setContacts] = useState<LenderContact[]>(initial);

  const update = (index: number, patch: Partial<LenderContact>) =>
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-3">
      <input type="hidden" name="additionalContacts" value={JSON.stringify(contacts)} />
      {contacts.map((contact, index) => (
        <div key={index} className="space-y-1.5 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Additional contact {index + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-muted-foreground"
              onClick={() => setContacts((prev) => prev.filter((_, i) => i !== index))}
            >
              <X className="size-3.5" />
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-c${index}-name`}>Name</Label>
              <Input
                id={`${idPrefix}-c${index}-name`}
                value={contact.name}
                onChange={(e) => update(index, { name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-c${index}-phone`}>Phone</Label>
              <Input
                id={`${idPrefix}-c${index}-phone`}
                type="tel"
                value={contact.phone ?? ""}
                onChange={(e) => update(index, { phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-c${index}-email`}>Email</Label>
              <Input
                id={`${idPrefix}-c${index}-email`}
                type="email"
                value={contact.email}
                onChange={(e) => update(index, { email: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setContacts((prev) => [...prev, { name: "", phone: null, email: "" }])}
      >
        <Plus className="size-3.5" />
        Add additional contact for this lender
      </Button>
      {contacts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Every email to this lender goes to the main contact and everyone listed here.
        </p>
      )}
    </div>
  );
}
