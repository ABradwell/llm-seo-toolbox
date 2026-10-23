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

const shareTitle = "LLMReady · Spec compliance for AI discovery";
const shareDescription =
  "Classify a site, then validate the manifests, access rules and parseability signals AI crawlers depend on. Open source, no signup.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: shareTitle,
    template: "%s · LLMReady",
  },
  description:
    "Audit any site's llms.txt, RFC 9309 access, static HTML and schema.org signals for AI crawlers. Open source, no signup.",
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
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "LLMReady",
    title: shareTitle,
    description: shareDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    description: shareDescription,
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
