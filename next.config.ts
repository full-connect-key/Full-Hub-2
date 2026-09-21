import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Gera .next/standalone com um server.js autocontido — o formato usado no
  // deploy em VPS (ver DEPLOY.md).
  output: "standalone",
};

export default nextConfig;
