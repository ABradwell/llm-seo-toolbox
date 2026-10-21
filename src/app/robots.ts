import type { MetadataRoute } from "next";

import { AI_CRAWLERS } from "@/lib/robots";
import { siteUrl } from "@/lib/site";

/**
 * Allow search and AI crawlers on public content, with named groups so the
 * policy is explicit and auditable. Keep the wildcard group as the default.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_CRAWLERS.map((crawler) => ({
        userAgent: crawler.label,
        allow: "/",
      })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
