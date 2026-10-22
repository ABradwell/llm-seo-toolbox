import type {
  ClassificationSignal,
  ClassificationSignalSource,
  SiteClassification,
  SiteType,
} from "./types";

import { SITE_TYPES, siteTypeById } from "./site-types";

export interface ClassificationInput {
  finalUrl: string;
  /** The initial HTML response, before JavaScript runs. */
  html: string;
  title?: string;
  description?: string;
  ogType?: string | null;
  jsonLdTypes?: string[];
  sitemapUrls?: string[];
  /** In-page navigation links, used as a second URL sample. */
  navUrls?: string[];
  llmsTxt?: string | null;
  hasOpenApi?: boolean;
}

export interface ClassificationOptions {
  /** User-pinned profile. Automatic detection is still reported. */
  override?: SiteType | null;
}

const TYPE_ORDER = new Map(SITE_TYPES.map((type, index) => [type.id, index]));

const PATH_PATTERNS: Record<SiteType, RegExp> = {
  docs: /(^|\/)(docs?|documentation|reference|guides?|tutorials?|learn|api)(\/|$)/i,
  saas: /(^|\/)(pricing|features?|integrations?|changelog|customers?|solutions?|dashboard|signup|login|demo)(\/|$)/i,
  ecommerce: /(^|\/)(products?|collections?|shop|store|cart|checkout|categories?|deals?)(\/|$)/i,
  portfolio: /(^|\/)(work|projects?|portfolio|case-studies|gallery|resume|cv)(\/|$)/i,
  "blog-media": /(^|\/)(blog|news|articles?|posts?|stories|magazine|podcasts?|authors?)(\/|$)/i,
  "local-business":
    /(^|\/)(locations?|services?|book|appointments?|menu|hours|reviews?|directions?)(\/|$)/i,
};

const HOST_PATTERNS: Partial<Record<SiteType, RegExp>> = {
  docs: /^docs[.-]/,
  "blog-media": /^(blog|news|magazine)[.-]/,
  ecommerce: /^(shop|store)[.-]/,
  portfolio: /^portfolio[.-]/,
  saas: /^app[.-]/,
};

const KEYWORD_PATTERNS: Record<SiteType, RegExp> = {
  docs: /\b(documentation|docs|developer guide|api reference|getting started|reference manual|knowledge base|handbook)\b/gi,
  saas: /\b(platform|software|saas|free trial|book a demo|pricing|integrations|workflow|dashboard)\b/gi,
  ecommerce: /\b(shop|store|add to cart|free shipping|checkout|collection|buy now|sale)\b/gi,
  portfolio:
    /\b(portfolio|designer|photographer|illustrator|creative director|freelance|selected work|case study)\b/gi,
  "blog-media": /\b(news|magazine|publication|blog|journal|editorial|stories|podcast)\b/gi,
  "local-business":
    /\b(restaurant|cafe|salon|barber|dentist|clinic|law firm|plumber|electrician|near me|opening hours|local)\b/gi,
};

const JSON_LD_RULES: Record<string, SiteType[]> = {
  techarticle: ["docs"],
  apireference: ["docs"],
  softwareapplication: ["saas"],
  webapplication: ["saas"],
  mobileapplication: ["saas"],
  product: ["ecommerce"],
  offer: ["ecommerce"],
  aggregateoffer: ["ecommerce"],
  itemlist: ["ecommerce"],
  collectionpage: ["ecommerce"],
  person: ["portfolio"],
  profilepage: ["portfolio"],
  creativework: ["portfolio"],
  visualartwork: ["portfolio"],
  photograph: ["portfolio"],
  article: ["blog-media"],
  newsarticle: ["blog-media"],
  blogposting: ["blog-media"],
  blog: ["blog-media"],
  reportagenewsarticle: ["blog-media"],
  videoobject: ["blog-media"],
  podcastepisode: ["blog-media"],
  localbusiness: ["local-business"],
  service: ["local-business"],
  store: ["local-business", "ecommerce"],
  foodestablishment: ["local-business"],
  restaurant: ["local-business"],
  cafeorcoffeeshop: ["local-business"],
  bakery: ["local-business"],
  barorpub: ["local-business"],
  dentist: ["local-business"],
  physician: ["local-business"],
  medicalclinic: ["local-business"],
  legalservice: ["local-business"],
  attorney: ["local-business"],
  homeandconstructionbusiness: ["local-business"],
  plumber: ["local-business"],
  electrician: ["local-business"],
  hvacbusiness: ["local-business"],
  roofingcontractor: ["local-business"],
  healthandbeautybusiness: ["local-business"],
  hairsalon: ["local-business"],
  beautysalon: ["local-business"],
  dayspa: ["local-business"],
  automotiverepair: ["local-business"],
  autodealer: ["local-business"],
  realestateagent: ["local-business"],
  lodgingbusiness: ["local-business"],
  hotel: ["local-business"],
};

const STRONG_JSON_LD: Record<string, number> = {
  techarticle: 16,
  apireference: 14,
  softwareapplication: 18,
  webapplication: 16,
  mobileapplication: 10,
  product: 16,
  offer: 8,
  aggregateoffer: 8,
  itemlist: 5,
  collectionpage: 4,
  person: 14,
  profilepage: 16,
  creativework: 8,
  visualartwork: 10,
  photograph: 10,
  article: 14,
  newsarticle: 16,
  blogposting: 14,
  blog: 14,
  reportagenewsarticle: 16,
  videoobject: 6,
  podcastepisode: 8,
  localbusiness: 18,
  service: 6,
  store: 10,
  foodestablishment: 18,
  restaurant: 18,
  cafeorcoffeeshop: 18,
  bakery: 18,
  barorpub: 18,
  dentist: 18,
  physician: 18,
  medicalclinic: 18,
  legalservice: 18,
  attorney: 18,
  homeandconstructionbusiness: 18,
  plumber: 18,
  electrician: 18,
  hvacbusiness: 18,
  roofingcontractor: 18,
  healthandbeautybusiness: 18,
  hairsalon: 18,
  beautysalon: 18,
  dayspa: 18,
  automotiverepair: 18,
  autodealer: 18,
  realestateagent: 18,
  lodgingbusiness: 18,
  hotel: 18,
};

function lookupRecord<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function scoreStore() {
  const totals: Record<SiteType, number> = {
    saas: 0,
    portfolio: 0,
    docs: 0,
    ecommerce: 0,
    "local-business": 0,
    "blog-media": 0,
  };
  const signals: ClassificationSignal[] = [];

  const add = (
    type: SiteType,
    weight: number,
    label: string,
    detail: string,
    source: ClassificationSignalSource,
  ) => {
    if (weight <= 0) return;
    totals[type] += weight;
    signals.push({ type, label, detail, weight, source });
  };

  return { totals, signals, add };
}

function normalizePath(value: string): string | null {
  try {
    const url = new URL(value);
    return url.pathname.toLowerCase() === "/" ? null : url.pathname.toLowerCase();
  } catch {
    if (value.startsWith("/")) return value.toLowerCase() === "/" ? null : value.toLowerCase();
    return null;
  }
}

function pathSample(input: ClassificationInput): string[] {
  const paths = [...(input.sitemapUrls ?? []), ...(input.navUrls ?? [])]
    .map(normalizePath)
    .filter((path): path is string => Boolean(path));

  return [...new Set(paths)].slice(0, 200);
}

function uniqueMatches(text: string, pattern: RegExp, limit = 4): string[] {
  const matches = text.match(pattern) ?? [];
  return [...new Set(matches.map((match) => match.toLowerCase()))].slice(0, limit);
}

function confidenceFor(top: number, second: number): number {
  if (top <= 0) return 15;
  const strength = top / (top + 12);
  const separation = (top - second) / top;
  return Math.max(15, Math.min(97, Math.round(30 + 48 * strength + 22 * separation)));
}

/**
 * Deterministic, under-100ms site profile classifier.
 *
 * Every input is data the audit already fetched, so classification adds no
 * network requests. Signals are additive votes; the highest total wins and
 * the user can always pin a different profile.
 */
export function classifySite(
  input: ClassificationInput,
  options: ClassificationOptions = {},
): SiteClassification {
  const { totals, signals, add } = scoreStore();
  const paths = pathSample(input);
  const html = input.html ?? "";
  const metaText = [input.title ?? "", input.description ?? ""].join(" ");

  // Hostname shape: docs.example.com, shop.example.com, app.example.com.
  try {
    const hostname = new URL(input.finalUrl).hostname.toLowerCase();
    for (const type of SITE_TYPES) {
      const pattern = HOST_PATTERNS[type.id];
      if (pattern?.test(hostname)) {
        add(
          type.id,
          10,
          `Hostname · ${hostname}`,
          `The hostname starts with a ${type.shortLabel.toLowerCase()} subdomain prefix.`,
          "hostname",
        );
      }
    }
  } catch {
    // A malformed final URL simply contributes no hostname signal.
  }

  // URL shape from the sitemap and in-page navigation.
  for (const type of SITE_TYPES) {
    const matches = paths.filter((path) => PATH_PATTERNS[type.id].test(path));
    if (matches.length === 0) continue;

    const weight =
      matches.length >= 5 ? 15 : matches.length >= 3 ? 11 : matches.length === 2 ? 7 : 4;
    const examples = matches.slice(0, 2).join(", ");
    add(
      type.id,
      weight,
      `${matches.length} ${type.shortLabel.toLowerCase()} URL${matches.length === 1 ? "" : "s"}`,
      `${matches.length} of ${paths.length} sampled paths match this profile (${examples}).`,
      "url",
    );
  }

  // JSON-LD usually gives the clearest statement of what a site is.
  const jsonLdByType = new Map<SiteType, string[]>();
  for (const rawType of input.jsonLdTypes ?? []) {
    const normalized = rawType.toLowerCase();
    for (const type of lookupRecord(JSON_LD_RULES, normalized) ?? []) {
      const list = jsonLdByType.get(type) ?? [];
      if (!list.includes(rawType)) list.push(rawType);
      jsonLdByType.set(type, list);
    }
  }

  for (const [type, types] of jsonLdByType) {
    const strongest = Math.max(
      ...types.map((typeName) => lookupRecord(STRONG_JSON_LD, typeName.toLowerCase()) ?? 4),
    );
    const weight = Math.min(20, strongest + Math.max(0, types.length - 1) * 2);
    add(
      type,
      weight,
      `Structured data · ${types.slice(0, 2).join(", ")}`,
      `JSON-LD declares ${types.join(", ")}, which is characteristic of this profile.`,
      "structured-data",
    );
  }

  // Title and description copy.
  for (const type of SITE_TYPES) {
    const words = uniqueMatches(metaText, KEYWORD_PATTERNS[type.id], 3);
    if (words.length === 0) continue;

    add(
      type.id,
      Math.min(10, 2 + words.length * 2),
      `Copy · ${words.join(", ")}`,
      `Title or description mentions ${words.map((word) => `“${word}”`).join(", ")}.`,
      "metadata",
    );
  }

  // OpenGraph type is a coarse but explicit page classification.
  const ogType = input.ogType?.toLowerCase() ?? "";
  if (ogType === "article") {
    add("blog-media", 5, "OpenGraph · article", "og:type is article.", "metadata");
    add("docs", 2, "OpenGraph · article", "og:type is article.", "metadata");
  } else if (ogType === "product") {
    add("ecommerce", 7, "OpenGraph · product", "og:type is product.", "metadata");
  } else if (ogType === "profile") {
    add("portfolio", 7, "OpenGraph · profile", "og:type is profile.", "metadata");
  }

  if (input.hasOpenApi) {
    add(
      "saas",
      6,
      "OpenAPI description",
      "An OpenAPI document is published at a known path.",
      "manifest",
    );
    add(
      "docs",
      4,
      "OpenAPI description",
      "An OpenAPI document is published at a known path.",
      "manifest",
    );
  }

  // Markup shape. Script and style bodies are removed first so code examples
  // inside bundles and inline styles do not skew the counts.
  const markup = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  const preCount = (markup.match(/<pre\b/gi) ?? []).length;
  const codeCount = (markup.match(/<code\b/gi) ?? []).length;
  if (preCount >= 2 || codeCount >= 10) {
    add(
      "docs",
      Math.min(14, 4 + preCount * 2 + Math.floor(codeCount / 4)),
      `Markup · ${preCount} code blocks`,
      `The initial HTML contains ${preCount} <pre> blocks and ${codeCount} <code> elements.`,
      "markup",
    );
  }

  const articleCount = (markup.match(/<article\b/gi) ?? []).length;
  const timeCount = (markup.match(/<time\b/gi) ?? []).length;
  if (articleCount >= 2 && timeCount >= 1) {
    add(
      "blog-media",
      Math.min(12, 6 + articleCount),
      `Markup · ${articleCount} article elements`,
      `The page repeats article/time markup, typical of an editorial index.`,
      "markup",
    );
  }

  if (
    /add[ -]to[ -]cart|data-product|itemprop=["']price["']|itemtype=["']https?:\/\/schema\.org\/Product/i.test(
      markup,
    )
  ) {
    add(
      "ecommerce",
      12,
      "Markup · commerce controls",
      "The page contains add-to-cart, price or Product markup.",
      "markup",
    );
  }

  if (/<address\b|href=["']tel:|opening hours|book (an )?appointment|visit us at/i.test(markup)) {
    add(
      "local-business",
      10,
      "Markup · location details",
      "The page includes an address, phone link or appointment copy.",
      "markup",
    );
  }

  if (/selected work|case stud(y|ies)|my work|portfolio/i.test(markup)) {
    add(
      "portfolio",
      8,
      "Markup · work showcase",
      "The page describes selected work, case studies or a portfolio.",
      "markup",
    );
  }

  if (/free trial|start for free|book a demo|trusted by/i.test(markup)) {
    add(
      "saas",
      6,
      "Markup · product CTAs",
      "The page uses trial, demo or social-proof CTAs.",
      "markup",
    );
  }

  // A curated llms.txt index is another programmatic statement of site shape.
  if (input.llmsTxt) {
    const manifest = input.llmsTxt.slice(0, 20_000);
    for (const type of SITE_TYPES) {
      const words = uniqueMatches(manifest, KEYWORD_PATTERNS[type.id], 2);
      if (words.length === 0) continue;
      add(
        type.id,
        Math.min(8, 2 + words.length * 2),
        `llms.txt · ${words.join(", ")}`,
        `The manifest mentions ${words.map((word) => `“${word}”`).join(", ")}.`,
        "manifest",
      );
    }
  }

  const ranked = SITE_TYPES.map((type) => ({ type: type.id, score: totals[type.id] })).sort(
    (a, b) => b.score - a.score || (TYPE_ORDER.get(a.type) ?? 0) - (TYPE_ORDER.get(b.type) ?? 0),
  );

  const detected = ranked[0];
  const runnerUp = ranked[1];
  const detectedConfidence = confidenceFor(detected.score, runnerUp.score);

  if (detected.score === 0) {
    signals.push({
      type: detected.type,
      label: "Fallback profile",
      detail:
        "No strong profile signals were found, so the audit defaulted to SaaS. Override it in the workspace if this site is a portfolio, store, local business or publication.",
      weight: 0,
      source: "fallback",
    });
  }

  const override = options.override ?? null;
  const effective = override ?? detected.type;
  const definition = siteTypeById(effective);
  const topSignals = signals
    .filter((signal) => signal.type === detected.type)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  return {
    type: effective,
    label: definition.label,
    confidence: override ? 100 : detectedConfidence,
    method: override ? "override" : "heuristic",
    detected: {
      type: detected.type,
      label: siteTypeById(detected.type).label,
      confidence: detectedConfidence,
    },
    signals:
      topSignals.length > 0
        ? topSignals
        : signals.filter((signal) => signal.source === "fallback").slice(0, 1),
    compatibility: {
      openApiScored: definition.openApiRelevant,
      recommendedSchema: [...definition.recommendedSchema],
      note: definition.auditNote,
    },
  };
}
