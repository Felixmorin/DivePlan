import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};
nextConfig.outputFileTracingIncludes = {
  "/*": ["./certs/prod-ca-2021.crt"],
  "/api/cron/agent-runs": ["./src/app/**/*.ts", "./src/app/**/*.tsx", "./src/lib/**/*.ts", "./src/lib/**/*.tsx", "./prisma/schema.prisma", "./prisma/migrations/**/*.sql", "./db/migrations/**/*.sql"]
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
