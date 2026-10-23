import type { StructuredDataNode, StructuredDataReport } from "./structured-data";

const LOCAL_BUSINESS_SUBTYPES = new Set(
  [
    "LocalBusiness",
    "Restaurant",
    "CafeOrCoffeeShop",
    "FoodEstablishment",
    "Bakery",
    "BarOrPub",
    "Dentist",
    "Physician",
    "MedicalClinic",
    "LegalService",
    "Attorney",
    "HomeAndConstructionBusiness",
    "Plumber",
    "Electrician",
    "HVACBusiness",
    "RoofingContractor",
    "HealthAndBeautyBusiness",
    "HairSalon",
    "BeautySalon",
    "DaySpa",
    "AutomotiveRepair",
    "AutoDealer",
    "RealEstateAgent",
    "LodgingBusiness",
    "Hotel",
    "Store",
  ].map((value) => value.toLowerCase()),
);

const ARTICLE_SUBTYPES = new Set(
  [
    "Article",
    "NewsArticle",
    "BlogPosting",
    "ReportageNewsArticle",
    "TechArticle",
    "APIReference",
    "ScholarlyArticle",
    "SocialMediaPosting",
  ].map((value) => value.toLowerCase()),
);

const PRODUCT_SUBTYPES = new Set(
  ["Product", "IndividualProduct", "ProductModel", "ProductGroup", "SomeProducts", "Vehicle"].map(
    (value) => value.toLowerCase(),
  ),
);

/** Property paths required for a type before `schema-depth` calls it complete. */
const REQUIRED_PROPERTIES: Record<string, string[]> = {
  article: ["headline", "author", "datePublished", "dateModified", "publisher"],
  product: [
    "name",
    "description",
    "image",
    "offers.price",
    "offers.priceCurrency",
    "offers.availability",
  ],
  softwareapplication: ["name", "applicationCategory", "operatingSystem", "offers"],
  localbusiness: ["name", "address", "telephone", "openingHoursSpecification", "geo"],
  person: ["name", "jobTitle", "url", "sameAs"],
  techarticle: ["headline", "dateModified"],
  faqpage: ["mainEntity"],
};

export function isSchemaType(type: string, expected: string): boolean {
  const actual = type.toLowerCase();
  const target = expected.toLowerCase();
  if (actual === target) return true;
  if (target === "localbusiness") return LOCAL_BUSINESS_SUBTYPES.has(actual);
  if (target === "article") return ARTICLE_SUBTYPES.has(actual);
  if (target === "product") return PRODUCT_SUBTYPES.has(actual);
  if (target === "softwareapplication") {
    return actual === "webapplication" || actual === "mobileapplication";
  }
  if (target === "techarticle") return actual === "apireference";
  return false;
}

export function matchesAnyType(
  types: readonly string[],
  expected: readonly string[],
): string | null {
  for (const type of types) {
    if (expected.some((candidate) => isSchemaType(type, candidate))) return type;
  }
  return null;
}

export function schemaTableFor(types: readonly string[]): {
  key: string;
  required: readonly string[];
} | null {
  const normalized = types.map((type) => type.toLowerCase());
  if (normalized.some((type) => type === "faqpage")) {
    return { key: "FAQPage", required: REQUIRED_PROPERTIES.faqpage };
  }
  if (normalized.some((type) => type === "techarticle" || type === "apireference")) {
    return { key: "TechArticle", required: REQUIRED_PROPERTIES.techarticle };
  }
  if (normalized.some((type) => ARTICLE_SUBTYPES.has(type))) {
    return { key: "Article", required: REQUIRED_PROPERTIES.article };
  }
  if (normalized.some((type) => PRODUCT_SUBTYPES.has(type))) {
    return { key: "Product", required: REQUIRED_PROPERTIES.product };
  }
  if (normalized.some((type) => type === "softwareapplication" || type === "webapplication")) {
    return { key: "SoftwareApplication", required: REQUIRED_PROPERTIES.softwareapplication };
  }
  if (normalized.some((type) => LOCAL_BUSINESS_SUBTYPES.has(type))) {
    return { key: "LocalBusiness", required: REQUIRED_PROPERTIES.localbusiness };
  }
  if (normalized.some((type) => type === "person")) {
    return { key: "Person", required: REQUIRED_PROPERTIES.person };
  }
  return null;
}

function valueAt(properties: Record<string, unknown>, path: string): unknown {
  let current: unknown = properties;
  for (const segment of path.split(".")) {
    if (Array.isArray(current)) {
      const values = current.map((entry) =>
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)[segment]
          : undefined,
      );
      current = values.find((value) => value !== undefined);
      continue;
    }
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function presentPaths(node: StructuredDataNode, required: readonly string[]): string[] {
  return required.filter((path) => {
    if (path === "mainEntity") {
      const entities = valueAt(node.properties, "mainEntity");
      if (!Array.isArray(entities)) return hasValue(entities);
      return (
        entities.length > 0 &&
        entities.every(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            hasValue((entry as Record<string, unknown>).name) &&
            hasValue(valueAt(entry as Record<string, unknown>, "acceptedAnswer.text")),
        )
      );
    }
    return hasValue(valueAt(node.properties, path));
  });
}

export interface SchemaDepthResult {
  node: StructuredDataNode | null;
  type: string | null;
  required: readonly string[];
  present: string[];
  missing: string[];
  percentage: number;
}

export function scoreSchemaDepth(
  report: StructuredDataReport,
  requiredSchema: readonly string[],
): SchemaDepthResult {
  const candidates = [...report.nodes].sort((a, b) => {
    const left = requiredSchema.some((type) =>
      a.types.some((candidate) => isSchemaType(candidate, type)),
    );
    const right = requiredSchema.some((type) =>
      b.types.some((candidate) => isSchemaType(candidate, type)),
    );
    if (left !== right) return left ? -1 : 1;
    return (a.format === "json-ld" ? 0 : 1) - (b.format === "json-ld" ? 0 : 1);
  });

  const matching = candidates.find((node) =>
    requiredSchema.some((type) => node.types.some((candidate) => isSchemaType(candidate, type))),
  );
  const node = matching ?? candidates.find((candidate) => schemaTableFor(candidate.types)) ?? null;
  if (!node) {
    return { node: null, type: null, required: [], present: [], missing: [], percentage: 0 };
  }

  const table = schemaTableFor(node.types);
  if (!table) {
    return {
      node,
      type: node.types[0] ?? null,
      required: [],
      present: [],
      missing: [],
      percentage: 0,
    };
  }

  let required = [...table.required];
  if (table.key === "TechArticle") {
    // TechArticle accepts either proficiencyLevel or about as its sixth signal.
    const hasAlternative =
      hasValue(valueAt(node.properties, "proficiencyLevel")) ||
      hasValue(valueAt(node.properties, "about"));
    required = [...required, "proficiencyLevel|about"];
    const present = presentPaths(
      node,
      required.filter((path) => path !== "proficiencyLevel|about"),
    );
    if (hasAlternative) present.push("proficiencyLevel|about");
    const missing = required.filter((path) => !present.includes(path));
    return {
      node,
      type: table.key,
      required,
      present,
      missing,
      percentage: Math.round((present.length / required.length) * 100),
    };
  }

  const present = presentPaths(node, required);
  const missing = required.filter((path) => !present.includes(path));
  return {
    node,
    type: table.key,
    required,
    present,
    missing,
    percentage: Math.round((present.length / required.length) * 100),
  };
}

export function placeholderFor(path: string): unknown {
  if (path === "mainEntity") {
    return [
      {
        "@type": "Question",
        name: "A question your customers ask",
        acceptedAnswer: { "@type": "Answer", text: "A direct answer in one paragraph." },
      },
    ];
  }
  if (path.endsWith(".price")) return "0.00";
  if (path.endsWith(".priceCurrency")) return "USD";
  if (path.endsWith(".availability")) return "https://schema.org/InStock";
  if (path === "author" || path === "publisher")
    return { "@type": "Organization", name: "Your name" };
  if (path === "image") return "https://example.com/image.jpg";
  if (path === "sameAs") return ["https://www.linkedin.com/company/your-company"];
  if (path === "address") {
    return {
      "@type": "PostalAddress",
      streetAddress: "1 Main Street",
      addressLocality: "Your city",
      addressCountry: "US",
    };
  }
  if (path === "geo") {
    return { "@type": "GeoCoordinates", latitude: 0, longitude: 0 };
  }
  if (path === "offers") return { "@type": "Offer", price: "0.00", priceCurrency: "USD" };
  if (path === "openingHoursSpecification") return "Mo-Fr 09:00-17:00";
  if (path.startsWith("date")) return "2026-01-01T00:00:00.000Z";
  return `Your ${path.replace(/\./g, " ")}`;
}
