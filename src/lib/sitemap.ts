const NON_PAGE_EXTENSIONS =
  /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|gz|tar|mp4|mp3|wav|woff2?|ttf|otf|eot|rss|atom)$/i;

export interface SitemapParseResult {
  kind: "urlset" | "sitemapindex" | "unknown";
  urls: string[];
  sitemaps: string[];
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

  return {
    kind,
    urls: kind === "sitemapindex" ? [] : dedupe(valid),
    sitemaps: kind === "sitemapindex" ? dedupe(valid) : [],
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

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
