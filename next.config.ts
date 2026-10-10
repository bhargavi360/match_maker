import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: ".next-build",
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ] }];
  },
};

export default config;
