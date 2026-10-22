import type { SiteType } from "./types";

export interface SiteTypeDefinition {
  id: SiteType;
  label: string;
  shortLabel: string;
  description: string;
  /** What this profile changes inside the audit. */
  auditNote: string;
  recommendedSchema: readonly string[];
  openApiRelevant: boolean;
}

/**
 * The six V3 profiles. Ordered roughly from product surfaces to content
 * surfaces; the order is also the tie-breaker when two heuristics score equal.
 */
export const SITE_TYPES: readonly SiteTypeDefinition[] = [
  {
    id: "saas",
    label: "SaaS / product",
    shortLabel: "SaaS",
    description: "Software products, platforms and developer tools sold directly online.",
    auditNote:
      "OpenAPI is scored. Schema expectations focus on SoftwareApplication, WebApplication and FAQPage.",
    recommendedSchema: ["SoftwareApplication", "WebApplication", "FAQPage"],
    openApiRelevant: true,
  },
  {
    id: "portfolio",
    label: "Portfolio",
    shortLabel: "Portfolio",
    description:
      "A personal or studio body of work: designers, photographers, artists, freelancers.",
    auditNote:
      "OpenAPI is not scored. Schema expectations focus on Person, ProfilePage and CreativeWork.",
    recommendedSchema: ["Person", "ProfilePage", "CreativeWork"],
    openApiRelevant: false,
  },
  {
    id: "docs",
    label: "Documentation",
    shortLabel: "Docs",
    description: "Documentation, API references, guides and technical knowledge bases.",
    auditNote:
      "OpenAPI is scored. Schema expectations focus on TechArticle, APIReference and FAQPage.",
    recommendedSchema: ["TechArticle", "APIReference", "FAQPage"],
    openApiRelevant: true,
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    shortLabel: "Store",
    description: "Product catalogues, retail stores and transactional shopping pages.",
    auditNote: "OpenAPI is not scored. Schema expectations focus on Product, Offer and ItemList.",
    recommendedSchema: ["Product", "Offer", "ItemList"],
    openApiRelevant: false,
  },
  {
    id: "local-business",
    label: "Local business",
    shortLabel: "Local",
    description: "A physical or regional service business with a location and opening hours.",
    auditNote:
      "OpenAPI is not scored. Schema expectations focus on LocalBusiness, Service and FAQPage.",
    recommendedSchema: ["LocalBusiness", "Service", "FAQPage"],
    openApiRelevant: false,
  },
  {
    id: "blog-media",
    label: "Blog / media",
    shortLabel: "Media",
    description: "News, publications, editorial blogs and long-form content.",
    auditNote:
      "OpenAPI is not scored. Schema expectations focus on Article, NewsArticle and BlogPosting.",
    recommendedSchema: ["Article", "NewsArticle", "BlogPosting"],
    openApiRelevant: false,
  },
];

const SITE_TYPES_BY_ID = new Map(SITE_TYPES.map((type) => [type.id, type]));

export function siteTypeById(id: SiteType): SiteTypeDefinition {
  return SITE_TYPES_BY_ID.get(id) ?? SITE_TYPES[0];
}

export function isSiteType(value: string | null | undefined): value is SiteType {
  return typeof value === "string" && SITE_TYPES_BY_ID.has(value as SiteType);
}
