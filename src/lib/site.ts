const FALLBACK_SITE_URL = "http://localhost:3000";

function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Resolve the public origin without hard-coding a deployment domain.
 * `NEXT_PUBLIC_SITE_URL` wins; Vercel's system variables cover preview and
 * production builds so canonical URLs never fall back to localhost.
 */
function resolveSiteUrl(): string {
  const configured = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const pointsAtLocalhost = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(
    configured,
  );
  if (configured && !(process.env.VERCEL && pointsAtLocalhost)) return configured;

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  if (vercelHost.trim()) return normalizeSiteUrl(vercelHost);

  return FALLBACK_SITE_URL;
}

export const siteUrl = resolveSiteUrl();

export const siteConfig = {
  name: "LLMReady",
  tagline: "Classify the site. Audit the specs that decide whether AI can read it.",
  description:
    "An open-source AI compatibility auditor. Classify a site into one of six profiles, then validate /llms.txt, RFC 9309 robots.txt, static HTML signal-to-noise and profile-specific schema.org metadata.",
  github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/ABradwell/llm-seo-toolbox",
  vercelProject: "https://vercel.com/bradwell-applications/llm-seo-toolbox",
  coffee: process.env.NEXT_PUBLIC_BMC_URL ?? "https://buymeacoffee.com/bradwell",
  repoName: "llm-seo-toolbox",
  llmsTxtSpec: "https://llmstxt.org/",
  rfc9309: "https://www.rfc-editor.org/rfc/rfc9309",
  schema: "https://schema.org/",
  vercelDeploy: `https://vercel.com/new/clone?repository-url=${encodeURIComponent(
    process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/ABradwell/llm-seo-toolbox",
  )}`,
} as const;
