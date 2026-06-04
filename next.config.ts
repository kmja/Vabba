import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is fully static (no SSR, API routes or server actions), so we
  // export it to plain HTML/CSS/JS in `out/` for hosting on a CDN such as
  // Cloudflare Pages. Remove this if you add server-side features later.
  output: "export",
};

export default nextConfig;
