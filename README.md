<div align="center">

# LLMReady

**Spec compliance for AI discovery.**

Audit the four things that decide whether an AI crawler can find, read and classify your site: `/llms.txt`, RFC 9309 access rules, static HTML parseability and schema.org metadata.

[![CI](https://github.com/aiden/llm-seo-toolbox/actions/workflows/ci.yml/badge.svg)](https://github.com/aiden/llm-seo-toolbox/actions/workflows/ci.yml)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0--only-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange.svg)](https://pnpm.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/aiden/llm-seo-toolbox/pulls)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Faiden%2Fllm-seo-toolbox)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support%20the%20project-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com)

</div>

---

## Why this exists

AI answers are assembled from what a crawler can read. If the manifest is missing, `robots.txt` blocks the wrong agent, or the first HTML response is a JavaScript shell, the page does not enter the context window. LLMReady measures that surface in one request and returns the exact source line and a copy-paste fix for every miss.

- **Audit** any public URL against 20 checks across four protocol pillars.
- **Author** `/llms.txt` and `/llms-full.txt` from the pages the audit discovered, with live structural validation.
- **See** the initial HTML next to the markdown an LLM scraper actually reads.

No accounts, no database, no JavaScript execution against the target site.

## Features

### Landing page — `/`

A terminal hero with a quick audit bar and four functional standard presets (`Next.js`, `Python Docs`, `Stripe API`, `Tailwind CSS`). Below it, a **live specification checklist** runs the real `/api/audit` engine against a selected preset and resolves the Discovery, Access and Structure rows in place — no mocked screenshots. The page closes with the crawler reference strip, GitHub, Vercel deploy and Buy Me a Coffee links.

### Workspace — `/app`

| Tab                   | What it does                                                                                                                                                                                                             |
| :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit matrix**      | Score and grade, per-pillar breakdown, every check with pass/warn/fail, the protocol it enforces, the source file and exact line number, a prioritized fix queue, discovery file table, and expandable code-level fixes. |
| **`llms.txt` editor** | Edit the site name, summary and notes, choose discovered sections, then preview `llms.txt` or `llms-full.txt` with line numbers, live validation and copy/download actions.                                              |
| **Scraper simulator** | Raw HTML beside the cleaned markdown a non-JS crawler would ingest, with payload reduction, token estimates, stripped-element counts and line numbers on both panes.                                                     |

## Quick start

```bash
git clone https://github.com/aiden/llm-seo-toolbox
cd llm-seo-toolbox
pnpm install
pnpm dev
```

Open <http://localhost:3000>, or go straight to <http://localhost:3000/app?url=docs.python.org>.

Requirements: **Node 20.9+** (CI uses Node 22) and **pnpm 10+**.

### Scripts

| Script           | Purpose                                         |
| :--------------- | :---------------------------------------------- |
| `pnpm dev`       | Start the development server on port 3000.      |
| `pnpm build`     | Production build.                               |
| `pnpm start`     | Serve the production build.                     |
| `pnpm lint`      | ESLint over the whole project.                  |
| `pnpm format`    | Prettier write (`format:check` to verify only). |
| `pnpm typecheck` | `tsc --noEmit`.                                 |
| `pnpm test`      | Vitest unit suite (`test:watch` to iterate).    |

### Configuration

All variables are optional; the app works out of the box.

| Variable                 | Default                                    | Used for                                          |
| :----------------------- | :----------------------------------------- | :------------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL`   | `http://localhost:3000`                    | Canonical metadata and OG tags.                   |
| `NEXT_PUBLIC_GITHUB_URL` | `https://github.com/aiden/llm-seo-toolbox` | Header, footer and landing page repository links. |
| `NEXT_PUBLIC_BMC_URL`    | `https://www.buymeacoffee.com`             | Buy Me a Coffee links in the header and footer.   |

Copy [`.env.example`](.env.example) to `.env.local` to override them.

## Scoring model

Each scored check returns **pass**, **warn** or **fail**, worth 100, 50 and 0 points. A pillar score is the weighted average of its checks; the overall score is the mean of the four pillars, so every pillar matters equally. Informational checks do not contribute.

| Grade | Score  | Label             |
| :---- | :----- | :---------------- |
| A     | 90–100 | LLM-ready         |
| B     | 75–89  | Nearly ready      |
| C     | 60–74  | Needs work        |
| D     | 40–59  | At risk           |
| F     | 0–39   | Invisible to LLMs |

### 1. Discovery & Manifests

| Check           | Weight | Passing means                                                                                                                                                           |
| :-------------- | :----- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llms.txt`      | 3      | Served as plain text at the root, with one H1, a summary and a markdown link index. Structural errors are reported.                                                     |
| `llms-full.txt` | 1      | A usable, unpaginated bundle. Optional: a missing file is a warning, not a failure.                                                                                     |
| `sitemap.xml`   | 2      | A URL set is discovered at `/sitemap.xml` or a robots-referenced location **and** `robots.txt` contains a `Sitemap:` directive. Without the directive, the check warns. |

Every issue carries a 1-based line number from the fetched response, so the matrix can point at the exact malformed heading, link or directive.

### 2. Crawler Access Rules

| Check                                                                   | Weight | Passing means                                                                    |
| :---------------------------------------------------------------------- | :----- | :------------------------------------------------------------------------------- |
| `robots.txt` reachable                                                  | 1      | The file is served and parses into user-agent groups. A missing file warns.      |
| Explicit AI user-agent policy                                           | 1      | At least one AI crawler is named in its own group, making intent auditable.      |
| `GPTBot`, `ClaudeBot`, `Google-Extended`, `PerplexityBot`, `Bytespider` | 2 each | No matching rule blocks the audited path (`/`).                                  |
| `robots` meta directives                                                | 1      | No `noindex` or `none` on the page.                                              |
| `X-Robots-Tag` header                                                   | 2      | The response does not send a blocking header; scoped restrictions are evaluated. |

RFC 9309 matching is implemented directly: the longest matching path wins, `Allow` wins ties, and both `*` and `$` syntax are supported. Blocking all agents with a wildcard `Disallow: /` is reported per vendor.

### 3. Static Parseability

| Check                   | Weight | Passing means                                                                                         |
| :---------------------- | :----- | :---------------------------------------------------------------------------------------------------- |
| Single H1               | 1.5    | Exactly one top-level heading inside the content region.                                              |
| Heading sequence        | 2      | No skipped levels, and the outline does not start deeper than H1.                                     |
| Static HTML SNR         | 2.5    | ≥ 65 % of visible text is content signal (warn ≥ 45 %, fail below).                                   |
| Server-rendered content | 2      | ≥ 600 characters of readable text in the initial HTML response (warn ≥ 200) — no JavaScript required. |

**Signal-to-noise ratio (SNR)** is content text divided by content text plus text from repeated chrome: `nav`, `header`, `footer`, `aside`, `role="banner"`, `role="contentinfo"`, `role="complementary"`, consent/cookie widgets and `aria-hidden` nodes. Scripts, styles, SVGs and frames are removed before measurement. A page that is mostly navigation scores low even when it has a lot of total text.

The content region is `main`, else `[role="main"]`, else the richest `article`, else `body` — and a region that only holds a teaser falls back to the whole document. Headings and the SNR source line are extracted with parse5 source locations, so the evidence points at the line in the original HTML response.

### 4. Structured Machine Interfaces

| Check                   | Weight | Passing means                                                                                                    |
| :---------------------- | :----- | :--------------------------------------------------------------------------------------------------------------- |
| JSON-LD presence/syntax | 2.5    | At least one `application/ld+json` block parses, with `@context`/`@type` when present.                           |
| Recommended schema type | 1.5    | One of `TechArticle`, `FAQPage` or `SoftwareApplication` is present (other valid schema types warn, not fail).   |
| OpenAPI description     | 1.5    | `/openapi.json`, `/.well-known/openapi.json` or `/openapi.yaml` looks like an OpenAPI document.                  |
| `.well-known` discovery | 0.5    | `security.txt` or `ai-plugin.json` is present and valid. Low weight because it is an optional discovery surface. |

## API

```http
GET /api/audit?url=example.com
```

`url` accepts a bare domain or a full URL; missing schemes default to `https://`.

```jsonc
{
  "url": "https://example.com/",
  "finalUrl": "https://example.com/en/",
  "domain": "example.com",
  "score": 78,
  "grade": "B",
  "gradeLabel": "Nearly ready",
  "pillars": [
    {
      "id": "discovery",
      "name": "Discovery & Manifests",
      "shortName": "Discovery",
      "description": "Can an agent find a curated, standards-compliant index of the content?",
      "score": 92,
      "checks": [
        {
          "id": "llms-txt",
          "label": "llms.txt manifest",
          "status": "pass",
          "summary": "Valid · 61 links",
          "detail": "A top-level heading and 61 markdown links were found.",
          "protocol": "llmstxt.org · H1 + markdown index",
          "evidence": {
            "file": "/llms.txt",
            "line": 1,
            "snippet": "# Example Docs",
          },
          "weight": 3,
        },
      ],
    },
  ],
  "profile": { "title": "…", "description": "…", "siteName": "…", "language": "en" },
  "pages": [{ "url": "…", "label": "Docs", "section": "Docs", "source": "sitemap" }],
  "files": [
    {
      "id": "robots-txt",
      "label": "robots.txt",
      "path": "/robots.txt",
      "url": "https://example.com/robots.txt",
      "found": true,
      "statusCode": 200,
      "bytes": 812,
      "note": "Found",
    },
  ],
  "vision": {
    "rawHtml": "…",
    "markdown": "…",
    "htmlBytes": 184320,
    "markdownBytes": 21400,
    "reductionPct": 88,
    "tokenEstimate": { "html": 46800, "markdown": 5400 },
    "removed": { "scripts": 12, "styles": 4, "landmarks": 6, "svg": 18, "frames": 1 },
    "rawTruncated": true,
    "markdownTruncated": false,
  },
  "fixes": [
    {
      "checkId": "json-ld",
      "pillarId": "structured",
      "pillarName": "Schema",
      "label": "JSON-LD presence & syntax",
      "status": "fail",
      "summary": "Missing",
      "recommendation": "Add a JSON-LD block with @context and @type…",
      "evidence": { "file": "/", "line": null, "snippet": null },
      "fix": { "language": "json", "code": "{ \"@context\": \"https://schema.org\" }" },
    },
  ],
  "meta": {
    "fetchMs": 1420,
    "pageCount": 80,
    "crawledAt": "2026-01-01T00:00:00.000Z",
    "cached": false,
  },
}
```

`evidence.line` is the 1-based line in the fetched source when one exists. `fix.language` is one of `markdown`, `robots`, `html`, `json`, `http`, `yaml` or `text`.

Errors are returned as `{ "error": { "code", "message", "hint?" } }`.

| Status | Code             | Meaning                                                                |
| :----- | :--------------- | :--------------------------------------------------------------------- |
| 400    | `missing_url`    | No `url` query parameter.                                              |
| 400    | `invalid_url`    | The URL is longer than 2048 characters.                                |
| 400    | `blocked_url`    | Private, loopback or reserved host, or an unsafe redirect target.      |
| 415    | `not_html`       | The URL returned something that is not an HTML page.                   |
| 429    | `rate_limited`   | More than 30 audits per minute from one IP (`retry-after` is set).     |
| 500    | `internal_error` | Unexpected failure.                                                    |
| 502    | `fetch_failed`   | Timeout, DNS failure or connection error.                              |
| 502    | `http_error`     | The target answered with 4xx/5xx (`403` usually means bot protection). |

Behaviour notes:

- **Cache:** identical URLs are memoized for 5 minutes per server instance (`meta.cached` tells you which one you got, and `x-audit-cache` repeats it as a header).
- **Rate limit:** 30 requests per minute per IP, sliding window, in memory.
- **Duration:** the route declares `maxDuration = 60`; audits usually finish in 1–3 seconds.
- **User agent:** `LLMReadyBot/0.1 (+https://github.com/aiden/llm-seo-toolbox; automated LLM-readiness audit)`.

## How the engine works

1. **Validate the target.** Only `http`/`https` on ports 80/443. The hostname is resolved and checked against loopback, private, link-local, multicast and reserved ranges (IPv4 and IPv6), plus blocked TLDs such as `.local` and `.internal`.
2. **Fetch politely.** Redirects are followed manually (max 5) and every hop is re-validated, so a public host cannot bounce the request into your network. Responses are capped by byte ceiling and timeout, `no-store`, with a descriptive user agent.
3. **Read the discovery surface.** `robots.txt`, `llms.txt`, `llms-full.txt`, `sitemap.xml` (indexes are expanded, with a fetch budget), `/openapi.json`, `/.well-known/security.txt` and `/.well-known/ai-plugin.json` — concurrently.
4. **Validate the manifests.** `llms.txt` is parsed for one H1, a blockquote summary, H2 sections, markdown links and pagination markers. Invalid files fail; missing optional files warn.
5. **Parse access.** RFC 9309 groups are matched per AI user agent, including wildcard and end-anchor paths. `X-Robots-Tag` and `robots` meta directives are evaluated separately from the file.
6. **Model the content.** Scripts, styles, SVGs, forms, frames, navigation, banners and hidden nodes are stripped. The content region drives the heading outline, SNR, SSR check and evidence line numbers.
7. **Build the LLM view.** The cleaned region is converted to markdown for the simulator and the `llms-full.txt` draft, then the score and prioritized fix queue are assembled.

Because nothing is rendered in a browser, the audit reports what is **in the initial HTML response** — exactly what a non-JS crawler sees. Client-rendered content is reported as such rather than silently scored as missing.

## Project structure

```text
.
├── .github/workflows/       # CI: format, lint, typecheck, tests, build, secret scan
├── .husky/pre-commit        # lint-staged + gitleaks
├── gameplans/               # Product & architecture specification
├── public/                  # Static assets
└── src/
    ├── app/
    │   ├── page.tsx         # Landing: terminal hero + live checklist
    │   ├── app/page.tsx     # Workspace shell
    │   ├── api/audit/       # Analysis endpoint
    │   ├── layout.tsx
    │   └── globals.css      # Tailwind v4 zinc theme, 4px radius scale
    ├── components/
    │   ├── landing/         # Terminal hero, live checklist, header/footer
    │   ├── workspace/       # Audit matrix, llms.txt editor, scraper simulator
    │   └── ui/              # Low-radius shadcn-style primitives
    ├── lib/
    │   ├── analyzer.ts      # Audit orchestration, 20 check builders
    │   ├── content.ts       # Content scope, SNR, headings, source lines
    │   ├── directives.ts    # X-Robots-Tag and robots meta evaluation
    │   ├── fetch-page.ts    # SSRF-safe fetcher with response headers
    │   ├── llms-txt.ts      # llms.txt structural validator
    │   ├── llms.ts          # llms.txt generation & page grouping
    │   ├── robots.ts        # RFC 9309 parsing, line numbers, AI policy
    │   ├── sitemap.ts       # sitemap & XML parsing
    │   ├── security.ts      # URL validation & DNS checks
    │   ├── score.ts         # Weighting and grades
    │   ├── samples.ts       # Functional standard presets
    │   └── rate-limit.ts    # Per-IP audit budget
    └── types/audit.ts       # Shared audit types, evidence and fixes
```

## Testing

`pnpm test` runs the Vitest suite over the pure helpers — RFC 9309 parsing and agent decisions with source lines, sitemap parsing and index expansion, SSRF validation, scoring, `llms.txt` validation, directive evaluation and the content model (scope selection, chrome removal, heading lines, SNR) — on fixtures, with no network access.

Live audits are not part of the suite. To check the engine against real sites, run `pnpm start` and request `/api/audit?url=…`, or use the standard presets in the workspace.

## Deployment (Vercel)

1. Push the repository to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new) — or click the **Deploy with Vercel** button above.
3. Framework preset **Next.js**, install command `pnpm install`, build command `pnpm build` are detected automatically.
4. Optionally set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GITHUB_URL` and `NEXT_PUBLIC_BMC_URL` in **Project → Settings → Environment Variables**.
5. Deploy.

Notes for production deployments:

- The rate limiter and audit cache live in instance memory. That is fine for a public demo; for stricter global limits, back them with Vercel KV/Upstash Redis and a shared cache.
- The audit route needs a serverless function timeout of a few seconds; keep `maxDuration = 60` where the plan allows it.
- Because the endpoint fetches arbitrary public URLs on demand, keep it on a plan with abuse protections and consider adding a WAF rule or origin allowlist if you run it at scale.

## Code quality & security tooling

- **Husky + lint-staged** — staged files are formatted with Prettier and fixed with ESLint on every commit (`--max-warnings=0`).
- **Gitleaks** — the pre-commit hook runs `gitleaks git --pre-commit --staged` with [`.gitleaks.toml`](.gitleaks.toml) and skips with a warning if the binary is not installed. CI runs the full scan with `gitleaks-action`.
- **CI** — format check, lint, typecheck, unit tests and a production build on every push and pull request.

## Support the project

If LLMReady helped you get your site cited:

- ⭐ Star the repository — it is the cheapest way to help others find it.
- ☕ [Buy me a coffee](https://www.buymeacoffee.com) — the same link is wired into the app header and footer via `NEXT_PUBLIC_BMC_URL`.

## Contributing

Issues and pull requests are welcome. Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build` before opening a PR, and add a fixture-based test for any new check.

## License

[GPL-3.0](LICENSE) © LLMReady contributors.
