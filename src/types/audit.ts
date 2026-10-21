export type CheckStatus = "pass" | "warn" | "fail" | "info";

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
}

export interface AuditMeta {
  fetchMs: number;
  pageCount: number;
  crawledAt: string;
  cached: boolean;
}

export interface AuditResult {
  url: string;
  finalUrl: string;
  domain: string;
  score: number;
  grade: AuditGrade;
  gradeLabel: string;
  pillars: AuditPillar[];
  profile: SiteProfile;
  pages: AuditPage[];
  files: DiscoveryFile[];
  vision: VisionPayload;
  fixes: AuditFix[];
  meta: AuditMeta;
}

export interface AuditApiError {
  error: {
    code: string;
    message: string;
    hint?: string;
  };
}
