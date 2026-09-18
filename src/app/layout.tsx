import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getCompanyName } from "@/server/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Route Segment Config inherits down from the root layout to every page/
// action that doesn't set its own — previously only /deals/[id] had this
// override (from the AI Lender Match timeout fix), so every other route
// was still on Vercel's default (15s on this Pro plan). A cold serverless
// start (loading this app's now-sizeable bundle — Anthropic, Stripe,
// Twilio, PDF rendering) plus a real database round trip can eat past that
// on its own before the actual work even starts, which surfaces to the
// browser as a bare "Failed to fetch" — not a slow response, no response
// at all. 120s costs nothing extra (Vercel bills actual execution time,
// not the configured ceiling) and gives real headroom; Pro allows up to
// 300s if this ever needs to go higher.
export const maxDuration = 120;

export async function generateMetadata(): Promise<Metadata> {
  const companyName = await getCompanyName();
  return {
    title: `${companyName} CRM`,
    description: "Internal loan pipeline CRM",
    // Proves domain ownership to Google Search Console — required before
    // Google will verify this app's OAuth branding (home page URL).
    verification: { google: "1xvzhMZlrORRsO6eb4Q5uQc4K8qNhYGs-cL2UZim_fY" },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-muted/30">
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
