import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};
nextConfig.outputFileTracingIncludes = {
  "/*": ["./certs/prod-ca-2021.crt"],
  "/api/cron/agent-runs": ["./src/app/**/*.ts", "./src/app/**/*.tsx", "./src/lib/**/*.ts", "./src/lib/**/*.tsx", "./src/components/**/*.ts", "./src/components/**/*.tsx", "./src/auth.ts", "./package.json", "./vercel.json", "./next.config.ts", "./README.md", "./docs/ai-agents.md", "./prisma/schema.prisma", "./prisma/migrations/**/*.sql", "./db/migrations/**/*.sql"],
  "/admin/agents/context": ["./docs/architecture/**/*.md", "./docs/agents/**/*.md"]
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
