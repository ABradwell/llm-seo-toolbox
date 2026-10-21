import { CoffeeBanner } from "@/components/landing/coffee-banner";
import { CrawlerStrip } from "@/components/landing/crawler-strip";
import { SiteFooter } from "@/components/landing/footer";
import { PipelineDiagram } from "@/components/landing/pipeline-diagram";
import { SiteHeader } from "@/components/landing/site-header";
import { SpecChecklist } from "@/components/landing/spec-checklist";
import { TerminalHero } from "@/components/landing/terminal-hero";
import { siteConfig } from "@/lib/site";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LLMReady",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: siteUrl,
  description: siteConfig.description,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://www.gnu.org/licenses/gpl-3.0.html",
  sameAs: [siteConfig.github, siteConfig.llmsTxtSpec, siteConfig.rfc9309],
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
        <SpecChecklist />
        <CoffeeBanner />
      </main>
      <SiteFooter />
    </>
  );
}
