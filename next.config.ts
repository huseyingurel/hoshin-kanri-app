import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit/fontkit are Node-only (font parsing, fs). Bundling them with Turbopack breaks on
  // fontkit's @swc/helpers import (`applyDecoratedDescriptor` was renamed). Externalize so the
  // server route `require`s them natively at runtime. They are only used in /api/export.
  serverExternalPackages: ["pdfkit", "fontkit"],
};

export default nextConfig;
