export const siteConfig = {
  name: "LLMReady",
  tagline: "Classify the site. Audit the specs that decide whether AI can read it.",
  description:
    "An open-source AI compatibility auditor. Classify a site into one of six profiles, then validate /llms.txt, RFC 9309 robots.txt, static HTML signal-to-noise and profile-specific schema.org metadata.",
  github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/aiden/llm-seo-toolbox",
  coffee: process.env.NEXT_PUBLIC_BMC_URL ?? "https://www.buymeacoffee.com",
  repoName: "llm-seo-toolbox",
  llmsTxtSpec: "https://llmstxt.org/",
  rfc9309: "https://www.rfc-editor.org/rfc/rfc9309",
  schema: "https://schema.org/",
  vercelDeploy: `https://vercel.com/new/clone?repository-url=${encodeURIComponent(
    process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/aiden/llm-seo-toolbox",
  )}`,
} as const;
