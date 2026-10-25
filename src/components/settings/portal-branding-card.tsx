"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  extractBrandKit,
  resetPortalBranding,
  savePortalBranding,
} from "@/server/actions/portal-branding";
import { isActionError } from "@/lib/action-result";
import {
  MIN_TEXT_CONTRAST,
  derivePortalTheme,
  normalizeHex,
  readableOn,
  type BrandSwatch,
} from "@/lib/brand-colors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PIPELINE_STAGES } from "@/lib/deal-pipeline";

const DEFAULT_HEADER = "#0B0C0D";
const DEFAULT_ACCENT = "#FA5F05";
const DEFAULT_BUTTON = "#FA5F05";

function ContrastChip({ color }: { color: string | null }) {
  if (!color) return <span className="text-xs text-muted-foreground">Enter a hex color like #14213D</span>;
  const { ratio } = readableOn(color);
  const passes = ratio >= MIN_TEXT_CONTRAST;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
        passes ? "bg-green-600/15 text-green-700 dark:text-green-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      }`}
    >
      Text contrast {ratio.toFixed(1)}:1 · {passes ? "passes" : "low"}
    </span>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = normalizeHex(value);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border"
          style={{ background: valid ?? "transparent" }}
          title="Pick a color"
        >
          <input
            type="color"
            aria-label={`${label} picker`}
            value={valid ?? "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          aria-label={`${label} hex`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-36"
          placeholder="#14213D"
          spellCheck={false}
        />
        <ContrastChip color={valid} />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Preview({
  header,
  accent,
  button,
  logoSrc,
  companyName,
}: {
  header: string;
  accent: string;
  button: string;
  logoSrc: string | null;
  companyName: string;
}) {
  const h = normalizeHex(header);
  const a = normalizeHex(accent);
  const b = normalizeHex(button);
  if (!h || !a || !b) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Enter all three colors to see the preview.
      </div>
    );
  }
  const t = derivePortalTheme(h, a, b);
  const current = 4;
  return (
    <div className="overflow-hidden rounded-2xl border bg-white text-[#0b0c0d]">
      <div className="space-y-3 px-4 py-4" style={{ background: t.head, color: t.headText }}>
        <div className="flex items-center gap-2.5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt="" className="max-h-8 w-auto max-w-[140px] object-contain" />
          ) : null}
          <span className="text-sm font-semibold">{companyName}</span>
        </div>
        <div className="flex">
          {PIPELINE_STAGES.map((s, i) => (
            <div
              key={s.value}
              className={`h-[22px] flex-1 ${i === 0 ? "rounded-l-full" : ""}`}
              style={{
                background: i < current ? t.accent : i === current ? t.soft : t.up,
                marginLeft: i === 0 ? 0 : -4,
                clipPath:
                  i === 0
                    ? "polygon(0 0, calc(100% - 5px) 0, 100% 50%, calc(100% - 5px) 100%, 0 100%)"
                    : "polygon(0 0, calc(100% - 5px) 0, 100% 50%, calc(100% - 5px) 100%, 0 100%, 5px 50%)",
              }}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2.5 px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold">To do</p>
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: t.tint, color: t.ink }}>
            Needed
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#eceae8]">
          <div className="h-full w-3/4 rounded-full" style={{ background: t.accent }} />
        </div>
        <span
          className="inline-flex min-h-9 items-center rounded-full px-4 text-[13px] font-bold"
          style={{ background: t.button, color: t.buttonOn }}
        >
          Upload file(s)
        </span>
      </div>
      <p className="border-t px-3 py-2 text-center text-[10px] font-medium text-[#605d5b]">
        Powered by <b className="text-[#0b0c0d]">Manna</b>
      </p>
    </div>
  );
}

export function PortalBrandingCard({
  configured,
  initialHeader,
  initialAccent,
  initialButton,
  initialPalette,
  logoSrc,
  companyName,
  previewHref,
}: {
  configured: boolean;
  initialHeader: string | null;
  initialAccent: string | null;
  initialButton: string | null;
  initialPalette: BrandSwatch[];
  logoSrc: string | null;
  companyName: string;
  previewHref: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [header, setHeader] = useState(initialHeader ?? DEFAULT_HEADER);
  const [accent, setAccent] = useState(initialAccent ?? DEFAULT_ACCENT);
  const [button, setButton] = useState(initialButton ?? initialAccent ?? DEFAULT_BUTTON);
  const [palette, setPalette] = useState<BrandSwatch[]>(initialPalette);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [isConfigured, setIsConfigured] = useState(configured);

  const headerOk = Boolean(normalizeHex(header));
  const accentOk = Boolean(normalizeHex(accent));
  const buttonOk = Boolean(normalizeHex(button));

  function readBrandKit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a brand kit file first.");
      return;
    }
    const formData = new FormData();
    formData.set("brandKit", file);
    startReading(async () => {
      try {
        const result = await extractBrandKit(formData);
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        setPalette(result.palette);
        setHeader(result.header);
        setAccent(result.accent);
        setButton(result.button);
        setAiNotes(result.notes);
        toast.success("Colors pulled from your brand kit. Adjust them below if you like, then save.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    });
  }

  function save() {
    const formData = new FormData();
    formData.set("headerColor", header);
    formData.set("progressColor", accent);
    formData.set("buttonColor", button);
    formData.set("palette", JSON.stringify(palette));
    startSaving(async () => {
      try {
        const result = await savePortalBranding(formData);
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        setHeader(normalizeHex(header) ?? header);
        setAccent(normalizeHex(accent) ?? accent);
        setButton(normalizeHex(button) ?? button);
        setIsConfigured(true);
        toast.success("Borrower portal colors saved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save the colors.");
      }
    });
  }

  function reset() {
    startSaving(async () => {
      try {
        const result = await resetPortalBranding();
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        setHeader(DEFAULT_HEADER);
        setAccent(DEFAULT_ACCENT);
        setButton(DEFAULT_BUTTON);
        setPalette([]);
        setAiNotes(null);
        setIsConfigured(false);
        toast.success("Back to the standard portal look");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't reset the colors.");
      }
    });
  }

  return (
    <Card data-hi>
      <CardHeader>
        <CardTitle>Borrower Portal Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="max-w-xl text-sm text-muted-foreground">
          Your borrower upload link picks up your logo and these colors automatically. The layout and the green
          &ldquo;completed&rdquo; color stay fixed so every portal is easy to read.
          {!isConfigured && " Until you save colors, the portal keeps its standard black-and-green look."}
        </p>

        <div className="flex flex-wrap items-start gap-8">
          <div className="min-w-[300px] flex-1 space-y-5">
            <div className="space-y-2 rounded-2xl border p-4">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="size-4 text-[var(--brand-text,currentColor)]" /> Pull colors from your brand kit
              </Label>
              <p className="text-xs text-muted-foreground">
                Upload your brand guidelines (PDF, PNG, JPG or SVG). We read the exact colors and suggest which go in the
                header, the progress bar and the upload button. You can change any of the three afterward.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                  className="max-w-xs"
                  aria-label="Brand kit file"
                />
                <Button type="button" variant="outline" onClick={readBrandKit} disabled={reading || !fileName}>
                  {reading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Reading…
                    </>
                  ) : (
                    "Read colors"
                  )}
                </Button>
              </div>
              {aiNotes && <p className="text-xs text-muted-foreground">{aiNotes}</p>}
            </div>

            <ColorField
              label="Header color"
              hint="Background of the portal header. Text on it switches to light or dark automatically."
              value={header}
              onChange={setHeader}
            />
            <ColorField
              label="Progress bar color"
              hint="The progress bar and the reached stages of the loan-stage bar."
              value={accent}
              onChange={setAccent}
            />
            <ColorField
              label="Upload button color"
              hint="The Upload file(s) and Submit buttons, and the Needed tags beside them."
              value={button}
              onChange={setButton}
            />

            {palette.length > 0 && (
              <div className="space-y-2">
                <Label>Brand colors found</Label>
                <ul className="flex flex-wrap gap-2">
                  {palette.map((c) => (
                    <li key={c.hex} className="flex items-center gap-2 rounded-xl border p-1.5 pr-2.5">
                      <span className="size-8 shrink-0 rounded-lg border" style={{ background: c.hex }} />
                      <span className="min-w-0 text-xs leading-tight">
                        <span className="block font-semibold tabular-nums">{c.hex}</span>
                        {c.name && <span className="block max-w-28 truncate text-muted-foreground">{c.name}</span>}
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={() => setHeader(c.hex)}>
                        Header
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setAccent(c.hex)}>
                        Progress
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setButton(c.hex)}>
                        Button
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              &ldquo;Powered by Manna&rdquo; always appears in small type at the bottom of the portal.
            </p>
          </div>

          <div className="min-w-[280px] flex-1 space-y-2">
            <Label>Live preview</Label>
            <Preview header={header} accent={accent} button={button} logoSrc={logoSrc} companyName={companyName} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={save} disabled={saving || !headerOk || !accentOk || !buttonOk}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
          {previewHref && (
            <Button asChild type="button" variant="outline">
              <a href={previewHref} target="_blank" rel="noreferrer">
                Open full portal
              </a>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={reset} disabled={saving || !isConfigured}>
            Reset colors
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
