import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { siteConfig, siteUrl } from "@/lib/site";

export const alt =
  "LLMReady: ship the specs AI crawlers actually read. A reference audit run checks llms.txt, robots.txt, the sitemap and schema.org, and scores the site 94 / A.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Mirrors the parchment and Pacific Cyan tokens in globals.css; ImageResponse
// cannot read CSS variables.
const color = {
  ink: "#131b23",
  code: "#1b2731",
  parchment: "#f2efea",
  muted: "#a8b4ba",
  accent: "#348aa7",
  accentLight: "#8ccbdd",
  pass: "#8ecba3",
  warn: "#e8b267",
};

interface RunLine {
  mark: "pass" | "info" | "warn";
  markColor: string;
  label: string;
  value: string;
  valueColor: string;
}

const RUN: RunLine[] = [
  {
    mark: "pass",
    markColor: color.pass,
    label: "/llms.txt",
    value: "142 links",
    valueColor: color.muted,
  },
  {
    mark: "pass",
    markColor: color.pass,
    label: "/robots.txt",
    value: "GPTBot · ClaudeBot",
    valueColor: color.muted,
  },
  {
    mark: "pass",
    markColor: color.pass,
    label: "/sitemap.xml",
    value: "1,204 URLs",
    valueColor: color.muted,
  },
  {
    mark: "info",
    markColor: color.accentLight,
    label: "classify",
    value: "docs · 86%",
    valueColor: color.accentLight,
  },
  {
    mark: "warn",
    markColor: color.warn,
    label: "schema.org",
    value: "FAQPage missing",
    valueColor: color.warn,
  },
];

const fontDir = join(process.cwd(), "src/app/_og/fonts");

// Read at module scope, as the Next.js docs do, so the file reads happen before
// prerendering and the image stays static under Cache Components.
const fonts = await (async () => {
  const [sansRegular, sansMedium, monoRegular, monoSemiBold] = await Promise.all(
    [
      "SpaceGrotesk-Regular.ttf",
      "SpaceGrotesk-Medium.ttf",
      "JetBrainsMono-Regular.ttf",
      "JetBrainsMono-SemiBold.ttf",
    ].map((file) => readFile(join(fontDir, file))),
  );
  return [
    { name: "Space Grotesk", data: sansRegular, weight: 400 as const, style: "normal" as const },
    { name: "Space Grotesk", data: sansMedium, weight: 500 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: monoRegular, weight: 400 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: monoSemiBold, weight: 600 as const, style: "normal" as const },
  ];
})();

function LogoMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="4" fill={color.accent} />
      <path
        d="M9 11.5V9h2.5M20.5 9H23v2.5M23 20.5V23h-2.5M11.5 23H9v-2.5"
        fill="none"
        stroke={color.ink}
        strokeWidth="1.8"
        strokeLinecap="square"
      />
      <path
        d="M12 13.2h8M12 16.2h6M12 19.2h4"
        fill="none"
        stroke={color.ink}
        strokeWidth="1.8"
        strokeLinecap="square"
      />
    </svg>
  );
}

// The Google Fonts subset of JetBrains Mono has no check mark glyph, so draw it.
function RunMark({ mark, fill }: { mark: RunLine["mark"]; fill: string }) {
  if (mark === "pass") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke={fill} strokeWidth="2" />
      </svg>
    );
  }
  return <span style={{ color: fill }}>{mark === "info" ? "→" : "!"}</span>;
}

export default async function Image() {
  const host = new URL(siteUrl).host;

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "56px 64px 48px",
        backgroundColor: color.ink,
        backgroundImage:
          "linear-gradient(to right, rgba(242, 239, 234, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(242, 239, 234, 0.05) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        color: color.parchment,
        fontFamily: "Space Grotesk",
      }}
    >
      {/* Fade the grid toward the edges, then add the cyan glow from the hero. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          backgroundImage: `radial-gradient(ellipse 90% 80% at 40% 0%, rgba(19, 27, 35, 0) 0%, ${color.ink} 85%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -420,
          left: 220,
          width: 840,
          height: 840,
          display: "flex",
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(52, 138, 167, 0.26) 0%, rgba(52, 138, 167, 0) 50%)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LogoMark />
          <div
            style={{ display: "flex", fontFamily: "JetBrains Mono", fontWeight: 600, fontSize: 28 }}
          >
            <span>LLM</span>
            <span style={{ color: color.accentLight }}>Ready</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            padding: "8px 14px",
            border: "1px solid rgba(140, 203, 221, 0.4)",
            backgroundColor: "rgba(140, 203, 221, 0.1)",
            borderRadius: 4,
            color: color.accentLight,
            fontFamily: "JetBrains Mono",
            fontSize: 15,
            letterSpacing: 1.8,
            textTransform: "uppercase",
          }}
        >
          Open source · no signup
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 48,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 80,
              fontWeight: 500,
              lineHeight: 1.02,
              letterSpacing: -2.8,
            }}
          >
            <span>Ship the specs</span>
            <span>AI crawlers</span>
            <span style={{ color: color.accentLight }}>actually read.</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 25,
              lineHeight: 1.4,
              color: "rgba(242, 239, 234, 0.75)",
            }}
          >
            {siteConfig.tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 480,
            border: "1px solid rgba(242, 239, 234, 0.15)",
            borderRadius: 4,
            backgroundColor: color.code,
            boxShadow: "0 30px 70px -30px rgba(0, 0, 0, 0.7)",
            fontFamily: "JetBrains Mono",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              borderBottom: "1px solid rgba(242, 239, 234, 0.1)",
              backgroundColor: "rgba(242, 239, 234, 0.04)",
              color: color.muted,
              fontSize: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                letterSpacing: 1.8,
                textTransform: "uppercase",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  backgroundColor: color.accentLight,
                }}
              />
              Reference run
            </div>
            <span>nextjs.org/docs</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "20px 20px 18px",
              fontSize: 19,
            }}
          >
            {RUN.map((line) => (
              <div key={line.label} style={{ display: "flex", alignItems: "center" }}>
                <span style={{ display: "flex", width: 28 }}>
                  <RunMark mark={line.mark} fill={line.markColor} />
                </span>
                <span style={{ display: "flex", width: 176, color: color.parchment }}>
                  {line.label}
                </span>
                <span style={{ display: "flex", color: line.valueColor }}>{line.value}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderTop: "1px solid rgba(242, 239, 234, 0.1)",
              backgroundColor: "rgba(242, 239, 234, 0.03)",
            }}
          >
            <span style={{ display: "flex", color: color.muted, fontSize: 15 }}>
              20 checks · 8-page sample
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ display: "flex", color: color.muted, fontSize: 15 }}>score</span>
              <span style={{ display: "flex", color: color.pass, fontSize: 34, fontWeight: 600 }}>
                94 / A
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 20,
          borderTop: "1px solid rgba(242, 239, 234, 0.15)",
          fontFamily: "JetBrains Mono",
          fontSize: 17,
          color: "rgba(242, 239, 234, 0.6)",
        }}
      >
        <span>llms.txt · RFC 9309 · schema.org</span>
        <span style={{ color: color.accentLight }}>{host}</span>
      </div>
    </div>,
    { ...size, fonts },
  );
}
