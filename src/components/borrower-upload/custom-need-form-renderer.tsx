"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomFormDefinition, CustomFormField } from "@/lib/custom-need-forms/types";

const INPUT_TYPE: Partial<Record<CustomFormField["type"], string>> = {
  text: "text",
  email: "email",
  tel: "tel",
  number: "number",
  currency: "number",
  date: "date",
};

// Fields any other field's showIf depends on need their current value
// tracked in state so the conditional fields react live as the borrower
// fills the form in — every other field stays a plain uncontrolled input.
function watchedFieldNames(definition: CustomFormDefinition): Set<string> {
  const names = new Set<string>();
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (field.showIf) names.add(field.showIf.field);
    }
  }
  return names;
}

function FieldInput({
  field,
  defaultValue,
  onWatchedChange,
}: {
  field: CustomFormField;
  defaultValue: string;
  onWatchedChange?: (value: string) => void;
}) {
  const id = `custom-form-${field.name}`;

  if (field.type === "select" || field.type === "yesno") {
    return (
      <Select
        name={field.name}
        defaultValue={defaultValue || undefined}
        onValueChange={onWatchedChange}
        required={!field.optional}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        id={id}
        name={field.name}
        rows={3}
        defaultValue={defaultValue}
        required={!field.optional}
        onChange={onWatchedChange ? (e) => onWatchedChange(e.target.value) : undefined}
      />
    );
  }

  return (
    <Input
      id={id}
      name={field.name}
      type={INPUT_TYPE[field.type] ?? "text"}
      step={field.type === "currency" ? "0.01" : undefined}
      defaultValue={defaultValue}
      required={!field.optional}
      onChange={onWatchedChange ? (e) => onWatchedChange(e.target.value) : undefined}
    />
  );
}

export function CustomNeedFormRenderer({
  definition,
  defaultValues,
}: {
  definition: CustomFormDefinition;
  defaultValues: Record<string, string>;
}) {
  const watched = useMemo(() => watchedFieldNames(definition), [definition]);
  const [watchedValues, setWatchedValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const name of watched) initial[name] = defaultValues[name] ?? "";
    return initial;
  });

  function isVisible(field: CustomFormField): boolean {
    if (!field.showIf) return true;
    return watchedValues[field.showIf.field] === field.showIf.equals;
  }

  return (
    <div className="space-y-10">
      {definition.sections.map((section) => (
        <section key={section.title} className="space-y-4">
          <h2 className="border-b pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {section.fields.filter(isVisible).map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`custom-form-${field.name}`}>
                  {field.label}
                  {!field.optional && <span className="text-destructive"> *</span>}
                </Label>
                <FieldInput
                  field={field}
                  defaultValue={defaultValues[field.name] ?? ""}
                  onWatchedChange={
                    watched.has(field.name)
                      ? (value) => setWatchedValues((prev) => ({ ...prev, [field.name]: value }))
                      : undefined
                  }
                />
                {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
