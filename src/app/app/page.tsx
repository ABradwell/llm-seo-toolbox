import type { Metadata } from "next";
import { Suspense } from "react";

import { AppEmptyState } from "@/components/workspace/app-empty-state";
import { Workspace, WorkspaceSkeleton } from "@/components/workspace/workspace";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { FAQ_ITEMS } from "@/lib/faq";
import { siteConfig, siteUrl } from "@/lib/site";

// The workspace reads ?url on the server so the empty state is in the first
// HTML response instead of a client-only skeleton.
export const instant = false;

export const metadata: Metadata = {
  title: "Audit workspace",
  description:
    "Run the V5 audit pipeline: site classification, llms.txt structure, RFC 9309 crawler access, static HTML signal-to-noise and profile-aware schema.org metadata.",
  alternates: { canonical: "/app" },
};

const updated = new Date().toISOString().slice(0, 10);
const organizationId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;
const applicationId = `${siteUrl}/#software`;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "LLMReady",
      url: siteUrl,
      description: siteConfig.description,
      sameAs: [siteConfig.github, siteConfig.vercelProject],
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: "LLMReady",
      url: siteUrl,
      description: siteConfig.description,
      inLanguage: "en",
      publisher: { "@id": organizationId },
    },
    {
      "@type": "SoftwareApplication",
      "@id": applicationId,
      name: "LLMReady",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description: siteConfig.description,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://www.gnu.org/licenses/gpl-3.0.html",
      publisher: { "@id": organizationId },
      datePublished: "2026-01-01",
      dateModified: updated,
      sameAs: [siteConfig.github, siteConfig.llmsTxtSpec, siteConfig.rfc9309],
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/app#faq`,
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedUrl = Array.isArray(params.url) ? params.url[0] : params.url;
  const url = requestedUrl?.trim() ?? "";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {url ? (
        <Suspense
          fallback={
            <WorkspaceShell defaultValue={url}>
              <WorkspaceSkeleton />
            </WorkspaceShell>
          }
        >
          <Workspace />
        </Suspense>
      ) : (
        <WorkspaceShell>
          <AppEmptyState />
        </WorkspaceShell>
      )}
    </>
  );
}
