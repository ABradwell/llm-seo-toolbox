const NON_PAGE_EXTENSIONS =
  /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|gz|tar|mp4|mp3|wav|woff2?|ttf|otf|eot|rss|atom)$/i;

export interface SitemapParseResult {
  kind: "urlset" | "sitemapindex" | "unknown";
  urls: string[];
  sitemaps: string[];
  /** URL → `lastmod` value for urlset entries that declare one. */
  lastmods: Record<string, string>;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function parseSitemap(xml: string): SitemapParseResult {
  const kind = /<sitemapindex[\s>]/i.test(xml)
    ? "sitemapindex"
    : /<urlset[\s>]/i.test(xml)
      ? "urlset"
      : "unknown";

  const locations = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((match) =>
    decodeXmlEntities(match[1]),
  );

  const valid = locations.filter((location) => {
    try {
      const url = new URL(location);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });

  const lastmods: Record<string, string> = {};
  if (kind === "urlset") {
    for (const match of xml.matchAll(/<url\b[\s\S]*?<\/url>/gi)) {
      const block = match[0];
      const loc = /<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(block)?.[1];
      const lastmod = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i.exec(block)?.[1];
      if (!loc || !lastmod) continue;
      const url = decodeXmlEntities(loc);
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
        lastmods[url] = decodeXmlEntities(lastmod);
      } catch {
        // Ignore malformed URLs.
      }
    }
  }

  return {
    kind,
    urls: kind === "sitemapindex" ? [] : dedupe(valid),
    sitemaps: kind === "sitemapindex" ? dedupe(valid) : [],
    lastmods,
  };
}

export function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 400).toLowerCase();
  return (
    (head.includes("<!doctype html") || head.includes("<html")) &&
    !head.includes("<urlset") &&
    !head.includes("<sitemapindex")
  );
}

export function isIndexablePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (NON_PAGE_EXTENSIONS.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

const NON_PAGE_PREFIXES = [
  "/api/",
  "/admin/",
  "/account/",
  "/login",
  "/logout",
  "/cart",
  "/checkout",
  "/_next/",
  "/static/",
  "/assets/",
  "/cdn-cgi/",
];

/**
 * A page-like URL on the same origin, suitable for the audit sample.
 * Sitemap URLs may contain content-selecting query strings; links may not.
 */
export function isPageCandidate(
  value: string,
  origin: string,
  options: { allowQuery?: boolean } = {},
): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== origin) return false;
    if (!isIndexablePage(url.toString())) return false;
    if (!options.allowQuery && url.search) return false;

    const path = url.pathname.toLowerCase();
    return !NON_PAGE_PREFIXES.some(
      (prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix),
    );
  } catch {
    return false;
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
