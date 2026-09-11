import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TermSheetField } from "@/lib/term-sheet-fields";

export function TermSheetFieldInputs({
  fields,
  values = {},
}: {
  fields: TermSheetField[];
  values?: Record<string, unknown>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fields.map((field) => {
        const defaultValue = values[field.key] ?? field.defaultValue;
        return (
          <div
            key={field.key}
            className={`space-y-1.5 ${field.type === "textarea" ? "md:col-span-2" : ""}`}
          >
            <Label htmlFor={field.key}>
              {field.label} {field.adminOnly && <span className="text-muted-foreground">(internal)</span>}
            </Label>
            {field.type === "select" ? (
              <Select name={field.key} defaultValue={typeof defaultValue === "string" ? defaultValue : undefined}>
                <SelectTrigger id={field.key} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "textarea" ? (
              <Textarea
                id={field.key}
                name={field.key}
                rows={3}
                defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
              />
            ) : (
              <Input
                id={field.key}
                name={field.key}
                type={
                  field.type === "number" || field.type === "currency" || field.type === "percent"
                    ? "number"
                    : field.type === "url"
                      ? "url"
                      : "text"
                }
                step={field.type === "percent" ? "0.01" : undefined}
                defaultValue={
                  typeof defaultValue === "string" || typeof defaultValue === "number"
                    ? defaultValue
                    : ""
                }
              />
            )}
            {field.helperText && <p className="text-xs text-muted-foreground">{field.helperText}</p>}
          </div>
        );
      })}
    </div>
  );
}
