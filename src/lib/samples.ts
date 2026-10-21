export interface SampleTarget {
  name: string;
  url: string;
  category: string;
  blurb: string;
}

export const SAMPLE_TARGETS: SampleTarget[] = [
  {
    name: "Vercel Docs",
    url: "https://vercel.com/docs",
    category: "Developer platform",
    blurb: "Publishes manifests, schemas and structured data end to end.",
  },
  {
    name: "Next.js Docs",
    url: "https://nextjs.org/docs",
    category: "Framework docs",
    blurb: "A large documentation surface with sitemap-driven discovery.",
  },
  {
    name: "Stripe Docs",
    url: "https://docs.stripe.com",
    category: "API reference",
    blurb: "Strong manifests on top of a heavy client-side shell.",
  },
  {
    name: "Python Docs",
    url: "https://docs.python.org/3/",
    category: "Language reference",
    blurb: "Dense server-rendered content with classic HTML chrome.",
  },
];
