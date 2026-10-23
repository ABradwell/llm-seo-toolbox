import { ActionSection } from "@/components/landing/action-section";
import { CliSection } from "@/components/landing/cli-section";
import { CoffeeBanner } from "@/components/landing/coffee-banner";
import { CrawlerStrip } from "@/components/landing/crawler-strip";
import { FaqSection } from "@/components/landing/faq-section";
import { SiteFooter } from "@/components/landing/footer";
import { PipelineDiagram } from "@/components/landing/pipeline-diagram";
import { SiteHeader } from "@/components/landing/site-header";
import { TerminalHero } from "@/components/landing/terminal-hero";
import { FAQ_ITEMS } from "@/lib/faq";
import { siteConfig, siteUrl } from "@/lib/site";

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
      "@id": `${siteUrl}/#faq`,
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteHeader />
      <main className="flex-1">
        <TerminalHero />
        <PipelineDiagram />
        <CrawlerStrip />
        <CliSection />
        <ActionSection />
        <FaqSection />
        <CoffeeBanner />
      </main>
      <SiteFooter />
    </>
  );
}
