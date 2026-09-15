import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas", "sharp"],
  // pdfjs-dist loads @napi-rs/canvas via a `require()` wrapped in a
  // try/catch (so it degrades gracefully where no canvas is available) —
  // Next.js's serverless dependency tracer doesn't follow that call, so
  // without this the native binary package silently never makes it into the
  // deployed function even though `serverExternalPackages` keeps it
  // unbundled. Forces it into every route's trace explicitly instead.
  outputFileTracingIncludes: {
    "**": ["./node_modules/@napi-rs/canvas*/**"],
  },
  experimental: {
    serverActions: {
      // Default is 1MB, which a handful of PDFs blows through instantly.
      // Document uploads are admin-only, so a generous limit here isn't a
      // meaningful abuse risk.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
