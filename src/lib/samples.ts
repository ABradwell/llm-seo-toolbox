export interface SampleTarget {
  name: string;
  url: string;
  category: string;
  blurb: string;
}

/** The V2 standard presets: one-click targets with very different architectures. */
export const SAMPLE_TARGETS: SampleTarget[] = [
  {
    name: "Next.js",
    url: "https://nextjs.org/docs",
    category: "Framework docs",
    blurb: "A large, sitemap-driven documentation surface with manifests and structured data.",
  },
  {
    name: "Python Docs",
    url: "https://docs.python.org/3/",
    category: "Language reference",
    blurb: "Dense server-rendered prose with classic HTML chrome and a long-lived URL structure.",
  },
  {
    name: "Stripe API",
    url: "https://docs.stripe.com",
    category: "API reference",
    blurb: "A heavy client-side shell around one of the most complete API documentation sets.",
  },
  {
    name: "Tailwind CSS",
    url: "https://tailwindcss.com/docs",
    category: "Utility framework",
    blurb: "A fast, component-driven docs site that leans on static generation and search.",
  },
];
