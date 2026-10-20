import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};
nextConfig.outputFileTracingIncludes = {
  "/*": ["./certs/prod-ca-2021.crt"]
};
nextConfig.images = {
  remotePatterns: [
    { protocol: "https", hostname: "**" },
    { protocol: "http", hostname: "localhost" }
  ]
};
nextConfig.turbopack = {
  root: process.cwd()
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
