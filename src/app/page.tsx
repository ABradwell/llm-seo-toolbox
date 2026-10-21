import { CoffeeBanner } from "@/components/landing/coffee-banner";
import { CodeShowcase } from "@/components/landing/code-showcase";
import { CrawlerStrip } from "@/components/landing/crawler-strip";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { SiteFooter } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SampleSites } from "@/components/landing/sample-sites";
import { SiteHeader } from "@/components/landing/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <CrawlerStrip />
        <FeatureGrid />
        <HowItWorks />
        <CodeShowcase />
        <SampleSites />
        <CoffeeBanner />
      </main>
      <SiteFooter />
    </>
  );
}
