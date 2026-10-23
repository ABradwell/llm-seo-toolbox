export type CheckStatus = "pass" | "warn" | "fail" | "info";

/** The headline score is for the origin by default; page scope preserves V2. */
export type AuditScope = "site" | "page";

/** Whether a check runs once per origin or once per sampled page. */
export type CheckScope = "site" | "page";

export type SamplingMethod = "sitemap" | "links" | "homepage" | "page";

/** What a crawler does with the content it fetches. */
export type CrawlerIntent = "training" | "search" | "fetch";

export interface AiCrawler {
  id: string;
  label: string;
  vendor: string;
  intent: CrawlerIntent;
  note: string;
}

export type StructuredDataFormat = "json-ld" | "microdata" | "rdfa";

export interface FreshnessSignal {
  source: "json-ld" | "meta" | "time" | "sitemap" | "header";
  property: string;
  iso: string;
  line: number | null;
}

export interface AgentFetchComparison {
  userAgent: string;
  status: number;
  /** True when the AI user agent received a different status or a body under 20% of the default size. */
  blocked: boolean;
  challenge: "cloudflare" | "akamai" | "generic" | null;
  bytes: number;
  finalUrl: string;
  detail: string;
}

/** Summary of a Person or Organization node found in a page's structured data. */
export interface IdentitySignal {
  type: string;
  format: StructuredDataFormat;
  name: string | null;
  url: string | null;
  description: string | null;
  sameAs: string[];
  jobTitle: string | null;
  knowsAbout: string[];
  line: number | null;
}

export type PageOutcome = "analyzed" | "unreachable" | "not-html" | "off-origin";

/**
 * V3 compatibility profiles. The classifier picks one from the raw site;
 * the user can override it in the workspace or with `?type=`.
 */
export type SiteType =
  "saas" | "portfolio" | "docs" | "ecommerce" | "local-business" | "blog-media";

export type ClassificationMethod = "heuristic" | "override";

export type ClassificationSignalSource =
  "url" | "hostname" | "structured-data" | "metadata" | "markup" | "manifest" | "fallback";

export interface ClassificationSignal {
  /** The profile this signal votes for. */
  type: SiteType;
  /** Short label shown in the workspace, e.g. "Structured data · TechArticle". */
  label: string;
  /** One sentence of supporting evidence. */
  detail: string;
  /** Points contributed to the profile score. */
  weight: number;
  source: ClassificationSignalSource;
}

export interface SiteClassificationAlternative {
  type: SiteType;
  label: string;
  /** 0–100. The winning profile carries the headline confidence. */
  confidence: number;
}

export interface SiteClassification {
  /** The profile the audit actually uses. */
  type: SiteType;
  label: string;
  /** 0–100. 100 when the user has pinned the profile. */
  confidence: number;
  method: ClassificationMethod;
  /** What the heuristics found, retained even when the profile is overridden. */
  detected: {
    type: SiteType;
    label: string;
    confidence: number;
  };
  /**
   * Every profile ranked by automatic support, highest first. The detected
   * profile is first and its confidence matches the headline value.
   */
  alternatives: SiteClassificationAlternative[];
  /** Top signals behind the automatic decision. */
  signals: ClassificationSignal[];
  /** What the profile changes inside the audit. */
  compatibility: {
    openApiScored: boolean;
    requiredSchema: string[];
    recommendedSchema: string[];
    faqExpected: boolean;
    note: string;
  };
}

/**
 * V2 pillars follow the standards the audit actually enforces:
 * discovery manifests, RFC 9309 access, static parseability and
 * structured machine interfaces.
 */
export type PillarId = "discovery" | "access" | "parseability" | "structured";

export type AuditGrade = "A" | "B" | "C" | "D" | "F";

export interface CheckEvidence {
  /** Request path or document the evidence came from, e.g. `/robots.txt`. */
  file: string;
  /** 1-based line number, or null when the source is a header/missing file. */
  line: number | null;
  /** The exact source line or a short excerpt. */
  snippet: string | null;
}

export type FixLanguage = "markdown" | "robots" | "html" | "json" | "http" | "yaml" | "text";

export interface CheckFix {
  language: FixLanguage;
  /** A copy-pasteable snippet that resolves the check. */
  code: string;
}

export interface PageSampleSummary {
  /** Pages that produced an observation for this check. */
  total: number;
  passed: number;
  warned: number;
  failed: number;
  /** Non-passing page URLs, capped for transport. */
  affected: string[];
}

export interface AuditCheck {
  /** Stable identifier, used for keys, tests and the live landing checklist. */
  id: string;
  label: string;
  status: CheckStatus;
  /** Short value shown next to the label, e.g. "42 URLs". */
  summary: string;
  /** One or two sentences explaining what was found. */
  detail: string;
  /** Actionable next step, only meaningful for warn/fail checks. */
  recommendation?: string;
  /** RFC or specification the check enforces. */
  protocol?: string;
  /** Where the evidence lives, with an exact line when one exists. */
  evidence?: CheckEvidence;
  /** Code-level resolution snippet shown in the audit matrix. */
  fix?: CheckFix;
  /** Relative importance inside its pillar. Defaults to 1. */
  weight: number;
  /** Whether this check describes the origin or a sampled page. */
  scope: CheckScope;
  /** 0–100 for aggregated page checks. Falls back to status points when absent. */
  score?: number;
  /** Coverage details for an aggregated page check. */
  sample?: PageSampleSummary;
}

export interface AuditPillar {
  id: PillarId;
  name: string;
  shortName: string;
  description: string;
  /** 0–100, weighted average of scored checks. */
  score: number;
  checks: AuditCheck[];
}

export interface SiteProfile {
  /** The URL as requested by the user. */
  url: string;
  /** The URL that actually served the page after redirects. */
  finalUrl: string;
  domain: string;
  title: string;
  description: string;
  siteName: string;
  language: string | null;
}

export interface AuditPage {
  url: string;
  label: string;
  section: string;
  source: "sitemap" | "link" | "home";
}

export interface PageAuditResult {
  url: string;
  finalUrl: string;
  label: string;
  section: string;
  source: "home" | "sitemap" | "link" | "focus";
  outcome: PageOutcome;
  status: "pass" | "warn" | "fail" | "info";
  /** Weighted average of this page's page-level checks, or null. */
  score: number | null;
  grade: AuditGrade | null;
  checks: AuditCheck[];
  title: string;
  textChars: number;
  snr: number;
  h1Count: number;
  headingCount: number;
  jsonLdTypes: string[];
  structuredFormats: StructuredDataFormat[];
  metaRobots: string;
  xRobotsTag: string | null;
  /** Freshest machine-readable date on the page, when one exists. */
  freshness: FreshnessSignal | null;
  /** Number of visible question-and-answer pairs found in the content. */
  faqPairs: number;
  /** True when the page carries a FAQPage node with a mainEntity list. */
  hasFaqSchema: boolean;
  /** Person and Organization nodes found on the page. */
  identity: IdentitySignal[];
  /** Visible meta description length, in characters. */
  descriptionChars: number;
  /** Absolute canonical URL declared by the page, when one exists. */
  canonical: string | null;
  error?: string;
  fetchMs: number;
}

export interface AuditCoverage {
  method: SamplingMethod;
  /** Unique page-like URLs before the display cap. */
  inventorySize: number;
  /** URLs included in `pages` for the llms.txt editor. */
  listedPages: number;
  /** Pages selected for the sample, including the seed. */
  sampleSize: number;
  /** Pages that produced page-level checks. */
  analyzedPages: number;
  /** Selected pages that could not be analysed. */
  failedPages: number;
  /** Inventory pages not selected because of the cap or deadline. */
  skippedPages: number;
  sitemapFound: boolean;
  homepageFallback: boolean;
  truncated: boolean;
  deadlineHit: boolean;
  note: string;
}

export interface DiscoveryFile {
  id: string;
  label: string;
  path: string;
  url: string;
  found: boolean;
  statusCode: number | null;
  bytes: number;
  note: string;
}

export interface RemovedNoise {
  scripts: number;
  styles: number;
  landmarks: number;
  svg: number;
  frames: number;
}

export interface VisionPayload {
  /** Homepage source preview with script/style bodies redacted, truncated for transport. */
  rawHtml: string;
  /** Cleaned, main-content markdown as an LLM scraper would ingest it. */
  markdown: string;
  htmlBytes: number;
  markdownBytes: number;
  textBytes: number;
  /** Percentage reduction from HTML source to markdown. */
  reductionPct: number;
  tokenEstimate: {
    html: number;
    markdown: number;
  };
  removed: RemovedNoise;
  rawTruncated: boolean;
  markdownTruncated: boolean;
}

export interface AuditFix {
  checkId: string;
  pillarId: PillarId;
  pillarName: string;
  label: string;
  status: CheckStatus;
  summary: string;
  recommendation: string;
  evidence?: CheckEvidence;
  fix?: CheckFix;
  weight: number;
  scope: CheckScope;
  sample?: PageSampleSummary;
}

export interface AuditMeta {
  fetchMs: number;
  /** Kept for compatibility: the number of URLs in `pages`. */
  pageCount: number;
  /** Every unique page-like URL found before the display cap. */
  discoveredPageCount: number;
  /** Pages that produced page-level checks. */
  sampledPageCount: number;
  crawledAt: string;
  cached: boolean;
  siteCached: boolean;
  focusCached: boolean;
  scoringVersion: "site-2";
}

export interface AuditResult {
  scope: AuditScope;
  url: string;
  /** The site root after redirects. */
  finalUrl: string;
  /** The page the user entered after redirects. */
  focusUrl: string;
  domain: string;
  score: number;
  grade: AuditGrade;
  gradeLabel: string;
  pillars: AuditPillar[];
  classification: SiteClassification;
  profile: SiteProfile;
  /** Inventory for the llms.txt editor, capped at 80. */
  pages: AuditPage[];
  /** Pages whose checks feed the site score. */
  pageResults: PageAuditResult[];
  /** The entered page, for the page-level drill-down. */
  focusPage: PageAuditResult;
  coverage: AuditCoverage;
  files: DiscoveryFile[];
  vision: VisionPayload;
  fixes: AuditFix[];
  /** Freshest machine-readable date found on the homepage. */
  freshness: FreshnessSignal | null;
  /** AI user-agent fetches compared with the default fetch. */
  agentFetch: AgentFetchComparison[];
  meta: AuditMeta;
}

export interface AuditApiError {
  error: {
    code: string;
    message: string;
    hint?: string;
  };
}
