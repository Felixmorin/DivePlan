import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};
const agentWorkerIncludes = [
  "./src/**/*.ts",
  "./src/**/*.tsx",
  "./src/**/*.js",
  "./src/**/*.jsx",
  "./src/**/*.mts",
  "./src/**/*.cts",
  "./src/**/*.mjs",
  "./src/**/*.cjs",
  "./scripts/**/*.ts",
  "./scripts/**/*.tsx",
  "./scripts/**/*.js",
  "./scripts/**/*.jsx",
  "./scripts/**/*.mts",
  "./scripts/**/*.cts",
  "./scripts/**/*.mjs",
  "./scripts/**/*.cjs",
  "./scripts/**/*.ps1",
  "./scripts/**/*.sh",
  "./scripts/**/*.py",
  "./scripts/**/*.sql",
  "./db/**/*.ts",
  "./db/**/*.tsx",
  "./db/**/*.js",
  "./db/**/*.jsx",
  "./db/**/*.mts",
  "./db/**/*.cts",
  "./db/**/*.mjs",
  "./db/**/*.cjs",
  "./db/**/*.ps1",
  "./db/**/*.sh",
  "./db/**/*.py",
  "./db/**/*.sql",
  "./src/auth.ts",
  "./package.json",
  "./vercel.json",
  "./next.config.ts",
  "./README.md",
  "./docs/ai-agents.md",
  "./prisma/schema.prisma",
  "./prisma/migrations/**/*.sql",
  "./db/migrations/**/*.sql"
];
nextConfig.outputFileTracingIncludes = {
  "/*": ["./certs/prod-ca-2021.crt"],
  "/api/cron/agent-runs": agentWorkerIncludes,
  "/api/agent-code-analysis/queue/claim": agentWorkerIncludes,
  "/admin/agents": agentWorkerIncludes,
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
