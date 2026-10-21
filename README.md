<div align="center">

# LLMReady

**An open-source audit and authoring studio for LLM-ready websites.**

Score how findable, crawlable and parseable your site is for AI assistants — then generate the `llms.txt` manifests and fixes that make it legible.

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

Assistants answer with citations. If crawlers cannot find your content, cannot read it, or waste their context window on scripts and navigation, you simply do not get cited. LLMReady measures that in one request and hands back a prioritized list of fixes.

- **Audit** any public URL against 18 checks across four pillars.
- **Author** the `llms.txt` and `llms-full.txt` manifests your site is missing, from the pages the audit discovered.
- **See** exactly what an LLM scraper reads, side by side with the raw HTML it has to wade through.

No accounts, no database, no JavaScript execution against the target site.

## Features

### Landing page — `/`

Hero with a scan bar, quick-run sample targets, a crawler reference strip (`Google-Extended`, `ClaudeBot`, `GPTBot`, `PerplexityBot`, `Bytespider`), the scoring model, an `llms.txt` showcase, and a support/GitHub banner.

### Workspace — `/app`

| Tab                          | What it does                                                                                                                                              |
| :--------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit dashboard**          | 0–100 score, grade, per-pillar breakdown, every check with its detail and recommendation, prioritized fixes, discovery file table, page inventory.        |
| **`llms.txt` builder**       | Edit the site name, summary and optional notes, pick which discovered sections to include, then preview, copy or download `llms.txt` and `llms-full.txt`. |
| **Scraper vision simulator** | Raw HTML next to the cleaned markdown a scraper would ingest, with payload reduction, token estimate and a count of stripped elements.                    |

### Audit engine — `GET /api/audit`

Fetches the page and its discovery files, parses `robots.txt` per AI user agent, expands the sitemap index, validates the manifests, probes JSON-LD / OpenAPI / `.well-known`, and models the content an LLM would actually read.

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
| `NEXT_PUBLIC_SITE_URL`   | request origin                             | Canonical metadata and OG tags.                   |
| `NEXT_PUBLIC_GITHUB_URL` | `https://github.com/aiden/llm-seo-toolbox` | Header, footer and landing page repository links. |
| `NEXT_PUBLIC_BMC_URL`    | `https://www.buymeacoffee.com`             | Buy Me a Coffee widget in the footer banner.      |

Copy [`.env.example`](.env.example) to `.env.local` to override them.

## Scoring model

Each check returns **pass**, **warn** or **fail**, worth 100, 50 and 0 points. A pillar score is the weighted average of its checks; the overall score is the mean of the four pillars, so every pillar matters equally.

| Grade | Score  | Label             |
| :---- | :----- | :---------------- |
| A     | 90–100 | LLM-ready         |
| B     | 75–89  | Nearly ready      |
| C     | 60–74  | Needs work        |
| D     | 40–59  | At risk           |
| F     | 0–39   | Invisible to LLMs |

### 1. Discovery & Manifests

| Check           | Weight | Passing means                                                                            |
| :-------------- | :----- | :--------------------------------------------------------------------------------------- |
| `llms.txt`      | 3      | Served as text, with an H1 and markdown links.                                           |
| `llms-full.txt` | 1      | Served as text — the optional single-request ingestion file.                             |
| `sitemap.xml`   | 2      | Found at `/sitemap.xml`, in `robots.txt`, or at `/sitemap_index.xml`, and contains URLs. |

### 2. Crawler Access Rules

| Check                                                                   | Weight | Passing means                                                        |
| :---------------------------------------------------------------------- | :----- | :------------------------------------------------------------------- |
| `robots.txt` reachable                                                  | 1      | The file is served and parses into groups.                           |
| Indexability signals                                                    | 1      | No `noindex`/`none` in the page's `robots` meta tags.                |
| `Google-Extended`, `ClaudeBot`, `GPTBot`, `PerplexityBot`, `Bytespider` | 2 each | Nothing in the site's rules blocks that agent from the path audited. |

Blocking all AI crawlers with a wildcard `Disallow: /` is reported per agent, so it is obvious which vendors you are actually excluding.

### 3. Semantic Signal-to-Noise

| Check                   | Weight | Passing means                                                                          |
| :---------------------- | :----- | :------------------------------------------------------------------------------------- |
| Single H1               | 2      | Exactly one top-level heading **inside the content region**.                           |
| Heading hierarchy       | 1.5    | No skipped levels and the outline does not start deeper than H1.                       |
| Text-to-DOM ratio       | 2      | ≥ 8 % readable text (warn ≥ 4 %) after chrome and scripts are removed from the markup. |
| Server-rendered content | 2      | ≥ 600 characters of text (warn ≥ 200) in the initial HTML response — no JS required.   |
| Non-content budget      | 1.5    | ≤ 55 % of the document (warn ≤ 75 %) is script, style, SVG and frame markup.           |

The content region is `main`, else `[role="main"]`, else the richest `article`, else `body` — and a region that only holds a teaser falls back to the whole document. Navigation, `aside`, cookie banners and `aria-hidden` nodes are removed before headings and text are measured, so sidebars cannot fake an outline.

### 4. Structured Machine Interfaces

| Check                   | Weight | Passing means                                                                        |
| :---------------------- | :----- | :----------------------------------------------------------------------------------- |
| JSON-LD schema          | 2.5    | At least one `application/ld+json` block parses.                                     |
| OpenAPI description     | 1.5    | `/openapi.json`, `/.well-known/openapi.json` or `/openapi.yaml` looks like a schema. |
| `.well-known` discovery | 1      | `security.txt` or `ai-plugin.json` is present and valid.                             |

## API

```http
GET /api/audit?url=example.com
```

`url` accepts a bare domain or a full URL; missing schemes default to `https://`.

```jsonc
{
  "url": "https://example.com/", // as requested
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
      "score": 92,
      "checks": [
        {
          "id": "llms-txt",
          "label": "llms.txt manifest",
          "status": "pass",
          "summary": "Found · 5.4 KB",
          "detail": "A top-level heading and 42 markdown links were found.",
          "weight": 3,
        },
      ],
    },
  ],
  "profile": { "title": "…", "description": "…", "siteName": "…", "language": "en" },
  "pages": [{ "url": "…", "label": "Docs", "section": "Docs", "source": "sitemap" }],
  "files": [{ "id": "robots-txt", "label": "robots.txt", "found": true, "statusCode": 200 }],
  "vision": {
    "markdown": "…",
    "reductionPct": 88,
    "tokenEstimate": { "html": 12000, "markdown": 900 },
  },
  "fixes": [{ "checkId": "json-ld", "status": "fail", "recommendation": "…" }],
  "meta": {
    "fetchMs": 1420,
    "pageCount": 80,
    "crawledAt": "2026-01-01T00:00:00.000Z",
    "cached": false,
  },
}
```

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

1. **Validate the target.** Only `http`/`https` on ports 80/443. The hostname is resolved and checked against loopback, private, link-local, multicast and reserved ranges (IPv4 and IPv6), plus blocked TLDs such as `.local`, `.internal` and `.localhost`.
2. **Fetch politely.** Redirects are followed manually (max 5) and every hop is re-validated, so a public host cannot bounce the request into your network. Responses are capped by byte ceiling and timeout, `no-store`, with a descriptive user agent.
3. **Read the discovery surface.** `robots.txt`, `llms.txt`, `llms-full.txt`, `sitemap.xml` (indexes are expanded, with a fetch budget), `/openapi.json`, `/.well-known/security.txt` and `/.well-known/ai-plugin.json` — concurrently.
4. **Model the content.** Scripts, styles, SVGs, forms, frames, navigation, banners and hidden nodes are stripped; the content region drives the heading outline, text-to-DOM ratio, SSR check and noise budget.
5. **Build the LLM view.** The cleaned region is converted to markdown for the vision simulator and the `llms-full.txt` draft.

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
    │   ├── page.tsx         # Landing page
    │   ├── app/page.tsx     # Workspace
    │   ├── api/audit/       # Analysis endpoint
    │   ├── layout.tsx
    │   └── globals.css      # Tailwind v4 theme & design tokens
    ├── components/
    │   ├── ui/              # shadcn-style primitives
    │   ├── landing/         # Hero, quick scan, features, samples, banner
    │   └── tool/            # Dashboard, llms.txt builder, vision simulator
    ├── lib/
    │   ├── analyzer.ts      # Audit orchestration
    │   ├── content.ts       # Content-scope model (chrome removal, headings, ratios)
    │   ├── fetch-page.ts    # SSRF-safe fetcher
    │   ├── robots.ts        # robots.txt parsing & per-agent decisions
    │   ├── sitemap.ts       # sitemap & XML parsing
    │   ├── security.ts      # URL validation & DNS checks
    │   ├── score.ts         # Weighting and grades
    │   ├── llms.ts          # llms.txt generation & page grouping
    │   └── rate-limit.ts    # Per-IP audit budget
    └── types/audit.ts       # Shared audit types
```

## Testing

`pnpm test` runs the Vitest suite over the pure helpers — robots parsing and agent decisions, sitemap parsing and index expansion, SSRF validation, scoring, `llms.txt` generation and the content model (scope selection, chrome removal, headings, ratios) — on fixtures, with no network access.

Live audits are not part of the suite. To check the engine against real sites, run `pnpm start` and request `/api/audit?url=…`, or use the sample targets in the workspace.

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
- ☕ [Buy me a coffee](https://www.buymeacoffee.com) — the same link is wired into the app footer via `NEXT_PUBLIC_BMC_URL`.

## Contributing

Issues and pull requests are welcome. Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build` before opening a PR, and add a fixture-based test for any new check.

## License

[GPL-3.0](LICENSE) © LLMReady contributors.
