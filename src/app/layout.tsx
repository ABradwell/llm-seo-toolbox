import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { siteUrl } from "@/lib/site";

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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LLMReady — Spec compliance for AI discovery",
    template: "%s · LLMReady",
  },
  description:
    "Classify any site, then audit /llms.txt, RFC 9309 robots.txt, static HTML signal-to-noise and profile-specific schema.org metadata. An open-source AI compatibility auditor for Gemini, Claude and AI search crawlers.",
  keywords: [
    "llms.txt",
    "llms-full.txt",
    "RFC 9309",
    "AI crawlers",
    "Google-Extended",
    "ClaudeBot",
    "GPTBot",
    "site classification",
    "LLM SEO",
    "GEO",
    "structured data",
  ],
  authors: [{ name: "LLMReady contributors" }],
  creator: "LLMReady",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "LLMReady",
    title: "LLMReady — Spec compliance for AI discovery",
    description:
      "Classify a site, then validate the manifests, access rules and parseability signals AI crawlers depend on. Open source, no signup.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LLMReady — Spec compliance for AI discovery",
    description:
      "Classify a site, then audit /llms.txt, robots.txt access for AI agents, static HTML SNR and profile-specific schema.org metadata.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2efea",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${mono.variable} h-full scroll-smooth`}
    >
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
