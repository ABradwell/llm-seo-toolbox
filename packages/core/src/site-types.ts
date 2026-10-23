import type { SiteType } from "./types";

export interface SiteTypeDefinition {
  id: SiteType;
  label: string;
  shortLabel: string;
  description: string;
  /** What this profile changes inside the audit. */
  auditNote: string;
  /** At least one of these types must be present for `schema-types` to pass. */
  requiredSchema: readonly string[];
  /** Types that deepen the profile match. */
  recommendedSchema: readonly string[];
  /** Whether FAQ content is weighted for this profile. */
  faqExpected: boolean;
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
      "OpenAPI is scored. Schema expectations require SoftwareApplication or WebApplication, with FAQPage and Organization as depth signals.",
    requiredSchema: ["SoftwareApplication", "WebApplication"],
    recommendedSchema: ["SoftwareApplication", "WebApplication", "FAQPage", "Organization"],
    faqExpected: true,
    openApiRelevant: true,
  },
  {
    id: "portfolio",
    label: "Portfolio",
    shortLabel: "Portfolio",
    description:
      "A personal or studio body of work: designers, photographers, artists, freelancers.",
    auditNote:
      "OpenAPI is not scored. Schema expectations require Person, with ProfilePage and CreativeWork as depth signals.",
    requiredSchema: ["Person"],
    recommendedSchema: ["Person", "ProfilePage", "CreativeWork"],
    faqExpected: false,
    openApiRelevant: false,
  },
  {
    id: "docs",
    label: "Documentation",
    shortLabel: "Docs",
    description: "Documentation, API references, guides and technical knowledge bases.",
    auditNote:
      "OpenAPI is scored. Schema expectations require TechArticle or APIReference, with FAQPage and BreadcrumbList as depth signals.",
    requiredSchema: ["TechArticle", "APIReference"],
    recommendedSchema: ["TechArticle", "APIReference", "FAQPage", "BreadcrumbList"],
    faqExpected: true,
    openApiRelevant: true,
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    shortLabel: "Store",
    description: "Product catalogues, retail stores and transactional shopping pages.",
    auditNote:
      "OpenAPI is not scored. Schema expectations require Product, with Offer, BreadcrumbList and FAQPage as depth signals.",
    requiredSchema: ["Product"],
    recommendedSchema: ["Product", "Offer", "BreadcrumbList", "FAQPage"],
    faqExpected: true,
    openApiRelevant: false,
  },
  {
    id: "local-business",
    label: "Local business",
    shortLabel: "Local",
    description: "A physical or regional service business with a location and opening hours.",
    auditNote:
      "OpenAPI is not scored. Schema expectations require a LocalBusiness subtype, with Service and FAQPage as depth signals.",
    requiredSchema: ["LocalBusiness"],
    recommendedSchema: ["LocalBusiness", "Service", "FAQPage"],
    faqExpected: true,
    openApiRelevant: false,
  },
  {
    id: "blog-media",
    label: "Blog / media",
    shortLabel: "Media",
    description: "News, publications, editorial blogs and long-form content.",
    auditNote:
      "OpenAPI is not scored. Schema expectations require an Article subtype, with Person and Organization as depth signals.",
    requiredSchema: ["Article"],
    recommendedSchema: ["Article", "NewsArticle", "BlogPosting", "Person", "Organization"],
    faqExpected: false,
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
