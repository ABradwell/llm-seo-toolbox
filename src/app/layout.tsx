import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LLMReady — Spec compliance for AI discovery",
    template: "%s · LLMReady",
  },
  description:
    "Audit /llms.txt, RFC 9309 robots.txt, static HTML signal-to-noise and schema.org metadata. An open-source spec-compliance auditor for Gemini, Claude and AI search crawlers.",
  keywords: [
    "llms.txt",
    "llms-full.txt",
    "RFC 9309",
    "AI crawlers",
    "Google-Extended",
    "ClaudeBot",
    "GPTBot",
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
      "Validate the manifests, access rules and parseability signals AI crawlers depend on. Open source, no signup.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LLMReady — Spec compliance for AI discovery",
    description:
      "Audit /llms.txt, robots.txt access for AI agents, static HTML SNR and schema.org metadata.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
  colorScheme: "dark",
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
