import type { CSSProperties, ReactNode } from "react";
import { portalCssVars, type PortalTheme } from "@/lib/brand-colors";

type Logo = { src: string; isLight: boolean } | null;

/**
 * The shell shared by every borrower-facing upload page: the card, the header (the company's
 * logo, or its name as text) and the small "Powered by Manna" credit. With a theme the header
 * and accents take the company's colors; without one it's the standard black-and-green look.
 */
export function PortalFrame({
  theme,
  logo,
  companyName,
  headerExtra,
  children,
}: {
  theme: PortalTheme | null;
  logo: Logo;
  companyName: string;
  headerExtra: ReactNode;
  children: ReactNode;
}) {
  const style = theme ? (portalCssVars(theme) as CSSProperties) : undefined;
  // A logo gets a backing chip when it wouldn't show on the header color (a dark logo on a dark
  // header, a light logo on a light one).
  const headerIsDark = theme ? theme.headIsDark : true;
  const needsChip = logo ? headerIsDark !== logo.isLight : false;

  return (
    <div className="mx-auto max-w-3xl p-4 py-8 md:p-8" style={style} data-branded={theme ? "true" : undefined}>
      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div
          className={theme ? "bp-header px-6 py-6 md:px-8" : "bg-primary px-6 py-6 text-primary-foreground md:px-8"}
        >
          {logo ? (
            <div className="flex items-center gap-3">
              <div
                className={needsChip ? "rounded-md p-1.5" : ""}
                style={needsChip ? { background: headerIsDark ? "#FFFFFF" : "#111318" } : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.src} alt={companyName} className="max-h-10 w-auto max-w-[200px] object-contain" />
              </div>
              <span className="sr-only">{companyName}</span>
            </div>
          ) : (
            <p className="text-sm font-semibold tracking-wide uppercase opacity-80">{companyName}</p>
          )}
          {headerExtra}
        </div>
        <div className="space-y-6 bg-card p-6 md:p-8">{children}</div>
        <p className="border-t bg-card px-6 py-2.5 text-center text-[11px] text-muted-foreground">
          Powered by <strong className="font-semibold text-foreground">Manna</strong>
        </p>
      </div>
    </div>
  );
}
