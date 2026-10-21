import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const sans = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const serif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LLMReady — Make your site legible to AI",
    template: "%s · LLMReady",
  },
  description:
    "Audit how AI crawlers see your site, fix what blocks them, and generate the manifests that make your content easier to quote, cite, and recommend. Open source and free.",
  keywords: [
    "llms.txt",
    "LLM SEO",
    "AI crawlers",
    "GEO",
    "generative engine optimization",
    "robots.txt",
    "structured data",
  ],
  authors: [{ name: "LLMReady contributors" }],
  creator: "LLMReady",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "LLMReady",
    title: "LLMReady — Make your site legible to AI",
    description:
      "A free, open-source audit and authoring studio for LLM-ready websites. Score discovery, crawler access, semantic signal, and structured interfaces.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LLMReady — Make your site legible to AI",
    description:
      "Audit how AI crawlers see your site, fix what blocks them, and generate /llms.txt in minutes.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080a08",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full scroll-smooth`}
    >
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
