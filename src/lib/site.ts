export const siteConfig = {
  name: "LLMReady",
  tagline: "Make your site legible to the machines that read it.",
  description:
    "An open-source audit and authoring studio for LLM-ready websites. Score discovery, crawler access, semantic signal, and structured interfaces.",
  github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/aiden/llm-seo-toolbox",
  coffee: process.env.NEXT_PUBLIC_BMC_URL ?? "https://www.buymeacoffee.com",
  repoName: "llm-seo-toolbox",
  llmsTxtSpec: "https://llmstxt.org/",
} as const;
