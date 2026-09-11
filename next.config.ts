import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "pdf-parse", "pdfjs-dist"],
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
