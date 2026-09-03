import type { NextConfig } from "next";

const nextConfig: NextConfig = {};
nextConfig.images = {
  remotePatterns: [
    { protocol: "https", hostname: "**" },
    { protocol: "http", hostname: "localhost" }
  ]
};
nextConfig.turbopack = {
  root: process.cwd()
};

export default nextConfig;
