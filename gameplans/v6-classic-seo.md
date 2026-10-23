# LLMReady V6 — Classic SEO & Lewis Mode

**Project goal:** Add a second, deliberately conventional audit engine to LLMReady. V5 answers “can an AI crawler find, read and cite this site?”. V6 answers “is this site built to compete in classic search?” — crawlability, indexation, on-page relevance, internal architecture, structured data, local signals and performance proxies. It is reached through a hidden **Classic SEO** page and a new **Lewis Mode** theme toggle beside the coffee button.

V6 keeps the existing AI audit untouched. It adds a separate engine, a separate score, a separate report and a separate visual mode. No existing check, endpoint or score changes.

Three themes:

1. **A full classic audit.** Six pillars, profile-aware weights, page-level aggregation, evidence and a prioritised fix queue. “Full” means full check coverage over a bounded sample, not an unbounded crawl.
2. **Keyword readiness.** Manual keywords plus deterministic suggestions extracted from the site itself. Per-keyword page matching, field coverage, local fit and cannibalisation. Readiness bands, never a predicted position.
3. **Lewis Mode.** A persistent theme toggle that re-skins the whole app in a classic, editorial SEO palette and opens the hidden page. Unlisted, `noindex`, not in the sitemap, footer, `llms.txt` or OpenAPI.

---

## 1. Starting Point (V5 as built)

| Surface     | V5 behaviour                                                                                       |
| :---------- | :------------------------------------------------------------------------------------------------- |
| Engine      | `packages/core` — classifier, four AI pillars, 49 check ids, site/page scope, 8-page sample        |
| Web         | `/` landing, `/app` workspace, `/api/audit` GET, plain and technical views                         |
| Delivery    | CLI and GitHub Action wrap the same core engine                                                    |
| Design      | Parchment background, Pacific Cyan accent, Space Grotesk + JetBrains Mono, 4px radii               |
| Constraints | Static HTML only, no headless browser, no accounts, no database, 60s route limit, bounded requests |

V5 is strong on AI discovery and weak on the things a traditional SEO consultant checks first:

- No site-wide crawlability or indexation score.
- No title/meta/H1 quality scoring beyond presence.
- No internal link graph, broken-link check, click depth or orphan detection.
- No keyword-to-page mapping, cannibalisation or local service/location coverage.
- No SERP appearance preview (title, URL, description, Open Graph).
- No performance proxies.
- No way to switch the product into a conventional SEO mindset.

V6 adds those without diluting the AI audit’s promise.

### 1.1 Non-goals

V6 does **not** predict Google positions, measure backlinks, read Google Business Profile data, call the PageSpeed Insights API, render JavaScript, or crawl an entire large site. Those are phase-two integrations, not v1. The UI must say so.

---

## 2. Product Shape

### 2.1 The hidden route

- Route: `/classic-seo`.
- Page title: **Classic SEO**.
- Badge: **Lewis Mode**.
- `metadata.robots = { index: false, follow: false }`.
- Absent from `src/app/sitemap.ts`, the landing footer, `public/llms.txt`, `public/llms-full.txt` and `public/openapi.json`.
- Entry points: a ghost button immediately after `coffee` in both `SiteHeader` and `WorkspaceHeader`. Label **Lewis Mode**, `Search` icon, icon-only below `lg` with `aria-label="Lewis Mode: Classic SEO"`.
- Hidden means **unlisted, not private**. The button is a normal link, so crawlers can discover the URL; `noindex` keeps it out of search results. If the button must also be invisible to crawlers, it becomes a client-side `<button>` with `router.push`, at the cost of open-in-new-tab and simple link semantics. Recommended: normal link + `noindex`.

### 2.2 Lewis Mode theme

Lewis Mode is a persistent, site-wide visual mode, not just a page.

- Cookie: `lewis=1`, `Path=/`, `Max-Age=31536000`, `SameSite=Lax`, `Secure` on HTTPS.
- Root layout reads the cookie and sets `data-lewis="true"` on `<html>`.
- CSS overrides the semantic tokens under `[data-lewis="true"]`, so every component using `bg-background`, `text-foreground`, `border-line`, `bg-panel` and `text-accent-strong` re-themes without component changes.
- `/classic-seo` wraps its shell in `data-lewis="true"` as well, so a direct visit always looks classic even when the global cookie is absent.
- A new serif is loaded in `src/app/layout.tsx` as `--font-classic-serif` (Source Serif 4, latin, `display: swap`). Lewis Mode maps `--font-sans` to it; mono labels stay JetBrains Mono.
- Palette: warm ivory background, ink text, forest-green accent, hairline rules, squarer corners. Exact tokens in §3.7.
- Toggle behaviour:
  - Off → click sets the cookie, then navigates to `/classic-seo`.
  - On → click clears the cookie, then navigates to `/`.
  - Clicking while already on `/classic-seo` and off sets the cookie and refreshes in place.
- An active dot or accent border is driven by `[data-lewis="true"]` in CSS, so the toggle needs no React state and no hydration flicker.
- The mode is cosmetic. It never changes the audit engine, the API or stored data.

### 2.3 Page layout

```text
┌ header: logo · Classic SEO · Lewis Mode badge · AI audit · coffee · Lewis Mode toggle ┐
├ intro: what this audits, what it refuses to pretend                                           │
├ input: URL · keywords textarea · location · Suggest from site · Run classic audit             │
├ suggestions: grouped chips with intent, evidence, select all/none                              │
├ progress: fetching · reading pages · checking links · scoring                                 │
├ overview: grade ring · score · band · coverage · keyword readiness · top fixes                 │
├ tabs: Keywords · Pages · Links · Schema & SERP · Local · Performance · Fix queue               │
├ not measured: authority, rankings, GBP, reviews, competitor SERPs, field CWV                   │
└ footer                                                                                         ┘
```

### 2.4 Honesty contract

The page must never present a readiness score as a rank prediction.

- Headline copy: **“Classic SEO readiness, not a rank prediction.”**
- Grade labels: A **Classic-ready**, B **Nearly there**, C **Needs work**, D **At risk**, F **Invisible**.
- Keyword bands: **Strong**, **Competitive**, **Weak**, **Uncovered**.
- The “Not measured” panel is always visible, not hidden behind a tooltip.
- Coverage is reported on the overview: pages analysed vs inventory, link checks completed vs discovered, deadline truncation.
- No “projected position”, “guaranteed page 1”, “difficulty score” or traffic forecast in v1.

---

## 3. Architecture

### 3.1 New package

Create `packages/classic` (`@llm-seo-toolbox/classic`) as a sibling of `core`. A second engine belongs in its own package: it keeps the AI scoring model stable, gives classic checks their own test surface, and lets the CLI adopt it later without importing the web app.

```text
packages/classic/
├── package.json                 # depends on @llm-seo-toolbox/core, cheerio
├── src/
│   ├── index.ts                 # public exports
│   ├── types.ts                 # ClassicAuditResult, checks, keywords, coverage
│   ├── crawl.ts                 # discovery, bounded sample, cache, link budget
│   ├── signals.ts               # per-page extraction built on core content/metadata/schema
│   ├── links.ts                 # internal link graph, HEAD checks, depth, orphans
│   ├── keywords.ts              # parse, normalise, intent, suggestions, matching
│   ├── nap.ts                   # local name/address/phone extraction and consistency
│   ├── checks/
│   │   ├── crawl.ts             # crawl & indexation
│   │   ├── onpage.ts            # on-page & content
│   │   ├── links.ts             # architecture & links
│   │   ├── schema.ts            # structured data & SERP
│   │   ├── local.ts             # local SEO
│   │   └── performance.ts       # performance proxies
│   ├── score.ts                 # pillar weights, profile weights, grades, fix priority
│   ├── copy.ts                  # plain-language copy for the top checks
│   └── audit.ts                 # orchestration: suggest() and audit()
└── src/*.test.ts                # Vitest, fixtures, mocked fetch
```

Root `package.json` adds `"@llm-seo-toolbox/classic": "workspace:*"`. The web app imports it through a thin re-export in `src/lib/classic.ts` and types through `src/types/classic.ts`, following the existing core pattern.

### 3.2 Reuse from core

Do not copy these:

| Need                                                        | Core module                             |
| :---------------------------------------------------------- | :-------------------------------------- |
| Safe fetch, redirects, byte/time limits                     | `fetch-page.ts`                         |
| HTML to content model, text, headings, SNR                  | `content.ts`                            |
| Title, description, canonical, `lang`, `og:*`, dates, feeds | `metadata.ts`                           |
| JSON-LD, microdata, RDFa, schema depth                      | `structured-data.ts`, `schema-depth.ts` |
| Sitemap parsing and index expansion                         | `sitemap.ts`                            |
| Inventory building and deterministic sampling               | `sampling.ts`                           |
| Site profile classification                                 | `classifier.ts`                         |
| Entity / Organization / Person signals                      | `entities.ts`                           |
| URL labels and safety                                       | `url.ts`, `security.ts`                 |
| Date signals                                                | `dates.ts`                              |

Classic checks consume those outputs and apply their own pass/warn/fail rules. No AI check ids are reused.

### 3.3 Crawl plan and request budget

The audit is sample-based. “Full” means every check runs, not that every URL is fetched.

| Request class               |      Cap | Notes                                                             |
| :-------------------------- | -------: | :---------------------------------------------------------------- |
| Homepage                    |        1 | Seed, final URL, headers                                          |
| `robots.txt`, `sitemap.xml` |        2 | Sitemap indexes expanded up to 3                                  |
| Sampled pages               | 12 total | Homepage + 11; stratified by section plus keyword-path candidates |
| 404 probe                   |        1 | A random non-existent path, to catch soft 404s                    |
| Internal link HEAD checks   |       20 | Same-origin only, concurrency 6, 4s deadline                      |
| Hreflang alternates         |        5 | Only when hreflang is present                                     |
| Compression check           |        1 | HEAD on the homepage; reuses headers                              |
| **Worst case**              |  **~42** | Concurrency 4–6, 6s per request, 30s audit deadline               |

- Cache the crawl for 5 minutes per origin, max 50 entries. `suggest()` and `audit()` share it, so selecting suggestions does not re-crawl.
- Report `inventorySize`, `sampledPages`, `analysedPages`, `failedPages`, `linkChecksRun`, `linkChecksSkipped`, `hreflangChecks`, `truncated`, `deadlineHit`.
- Stop starting new work at 30s. Return partial results with a coverage note rather than a timeout.
- Never follow a redirect off-origin; reuse core’s SSRF-safe fetch.
- Do not render JavaScript. Say so in the coverage panel.

### 3.4 Types (shape)

```ts
export type ClassicPillarId = "crawl" | "onpage" | "links" | "schema" | "local" | "performance";

export type ClassicStatus = "pass" | "warn" | "fail" | "info";

export interface ClassicCheck {
  id: string;
  label: string;
  pillarId: ClassicPillarId;
  scope: "site" | "page";
  status: ClassicStatus;
  score?: number; // 0–100 for aggregated page checks
  summary: string;
  detail: string;
  recommendation?: string;
  evidence?: { url: string; line: number | null; snippet: string | null };
  fix?: { language: "html" | "json" | "text" | "http"; code: string };
  weight: number;
  sample?: { total: number; passed: number; warned: number; failed: number; affected: string[] };
}

export interface ClassicPillar {
  id: ClassicPillarId;
  name: string;
  score: number;
  weight: number;
  checks: ClassicCheck[];
}

export interface KeywordReadiness {
  keyword: string;
  intent: KeywordIntent;
  location: string | null;
  targetPage: string | null;
  score: number;
  band: "strong" | "competitive" | "weak" | "uncovered";
  fields: Record<
    "title" | "h1" | "url" | "meta" | "intro" | "headings" | "body" | "anchors" | "alt",
    number
  >;
  gaps: string[];
  competingPages: string[];
  localSignals: { city: boolean; schema: boolean; nap: boolean; areaServed: boolean };
}

export interface ClassicAuditResult {
  url: string;
  finalUrl: string;
  domain: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  band: "strong" | "competitive" | "weak" | "critical";
  classification: SiteClassification; // reused from core
  pillars: ClassicPillar[];
  keywords: KeywordReadiness[];
  suggestions: KeywordSuggestion[];
  pages: ClassicPageResult[];
  links: LinkGraphSummary;
  local: LocalAudit | null;
  performance: PerformanceProxy[];
  coverage: ClassicCoverage;
  fixes: ClassicFix[];
  meta: {
    fetchMs: number;
    pagesAnalysed: number;
    keywordCount: number;
    crawledAt: string;
    cached: boolean;
    scoringVersion: "classic-1";
  };
}
```

`ClassicPageResult` carries URL, label, section, status, score, title, description length, H1 text/count, word count, indexability, canonical, schema types, inbound/outbound link counts, image counts, HTML bytes, DOM nodes and fetch error. It is the drill-down backing the Pages tab.

### 3.5 API

`POST /api/classic-seo` with JSON:

```jsonc
// Suggest keywords before auditing
{ "mode": "suggest", "url": "example.com", "location": "Manchester" }

// Full audit
{
  "mode": "audit",
  "url": "example.com",
  "keywords": ["Manchester window repair", "double glazing Manchester"],
  "location": "Manchester"
}
```

- `suggest` returns `{ suggestions, foundations, pages, coverage }` from a light crawl.
- `audit` returns `ClassicAuditResult`. Keywords are optional; without them the site grade and suggestions still return.
- `maxDuration = 60`.
- Rate limit: suggest 1 credit, audit 3 credits, shared with `/api/audit` in the existing 30/min bucket.
- Errors use the existing `{ error: { code, message, hint? } }` shape: `missing_url`, `invalid_url`, `too_many_keywords`, `invalid_keyword`, `invalid_location`, `blocked_url`, `fetch_failed`, `http_error`, `not_html`, `rate_limited`, `internal_error`.
- `cache-control: no-store`; `x-classic-cache: hit|miss`; `x-classic-coverage: <analysed>/<sampled>`.
- Validations: 1–20 keywords, each ≤80 characters, deduped case-insensitively, location ≤80 characters, URL ≤2048 characters.
- No GET variant in v1. The page keeps results in memory; a shareable GET can follow once the shape settles.

### 3.6 UI files

New:

- `src/app/classic-seo/page.tsx` — server page, `noindex`, classic wrapper.
- `src/components/classic-seo/classic-seo-workspace.tsx` — client state machine.
- `src/components/classic-seo/audit-form.tsx`
- `src/components/classic-seo/keyword-suggestions.tsx`
- `src/components/classic-seo/classic-score.tsx`
- `src/components/classic-seo/pillar-grid.tsx`
- `src/components/classic-seo/keyword-table.tsx`
- `src/components/classic-seo/keyword-detail.tsx`
- `src/components/classic-seo/serp-preview.tsx`
- `src/components/classic-seo/pages-table.tsx`
- `src/components/classic-seo/links-panel.tsx`
- `src/components/classic-seo/schema-panel.tsx`
- `src/components/classic-seo/local-panel.tsx`
- `src/components/classic-seo/performance-panel.tsx`
- `src/components/classic-seo/fix-queue.tsx`
- `src/components/classic-seo/not-measured.tsx`
- `src/components/landing/lewis-mode-toggle.tsx`

Modified:

- `src/app/layout.tsx` — serif font variable, read `lewis` cookie, `data-lewis`.
- `src/app/globals.css` — classic token block.
- `src/components/landing/site-header.tsx` — toggle after coffee.
- `src/components/workspace/workspace-shell.tsx` — toggle after coffee; optional `quickAudit` prop to hide the AI audit bar on the classic page.
- `package.json`, `pnpm-lock.yaml` — workspace dependency.
- `src/app/sitemap.ts` — **no change**; a test proves `/classic-seo` is absent.

### 3.7 Theme tokens

```css
[data-lewis="true"] {
  --background: #f7f4ec;
  --foreground: #1f2933;
  --panel: #fffdf8;
  --panel-2: #efe9dc;
  --panel-3: #e3dac9;
  --muted: #5b6470;
  --line: rgba(31, 41, 51, 0.16);
  --line-strong: rgba(31, 41, 51, 0.32);
  --accent: #2f6b4f;
  --accent-hover: #3d7f60;
  --accent-strong: #24543e;
  --accent-soft: #dce9e0;
  --accent-contrast: #fffdf8;
  --accent-light: #9fc4ad;
  --pass: #2f6b4f;
  --warn: #a86a1f;
  --fail: #b23b48;
  --font-sans: var(--font-classic-serif);
}
```

- Optional radius refactor: move `--radius-*` values behind `--corner` so Lewis Mode can use 2px corners. If it risks the existing layout, leave the 4px scale alone.
- Contrast targets: body text ≥ 7:1, muted ≥ 4.5:1, accent links ≥ 4.5:1 on background and panel. Verify manually and in screenshots.
- `@media (prefers-reduced-motion: reduce)` already covers transitions; do not add theme animations that ignore it.

---

## 4. Classic Audit Checks

### 4.1 Scoring model

- Each check returns **pass**, **warn**, **fail** or **info**, worth 100, 50, 0 and ignored.
- A pillar score is the weighted average of its active checks.
- The overall score is the weighted mean of the six pillars, using profile weights below.
- Page-level checks are aggregated across the sample by mean status points, exactly like the AI audit: 11 of 12 pages pass → 92 → pass; 7 of 12 → 58 → warn.
- Grades: A 90–100, B 75–89, C 60–74, D 40–59, F 0–39.
- `scoringVersion: "classic-1"`. Any weight change bumps it and invalidates cached scores.
- Info checks are visible in the matrix and the report but never scored.

### 4.2 Pillar weights by profile

| Profile             | Crawl | On-page | Links | Schema | Local | Performance |
| :------------------ | ----: | ------: | ----: | -----: | ----: | ----------: |
| Default / portfolio |    20 |      35 |    15 |     20 |     0 |          10 |
| Local business      |    15 |      30 |    15 |     15 |    15 |          10 |
| E-commerce          |    20 |      25 |    15 |     25 |     0 |          15 |
| SaaS / docs         |    20 |      30 |    15 |     25 |     0 |          10 |
| Blog / media        |    15 |      40 |    15 |     20 |     0 |          10 |

The core classifier picks the profile. Local also activates when `LocalBusiness` schema or NAP signals are strong, even if the classifier chose another profile. Conditional schema checks (`schema-local`, `schema-product`, `schema-article`) are info when their profile is inactive. Because pillar scores are weighted averages of active checks, inactive conditions need no manual renormalisation.

### 4.3 Pillar 1 — Crawl & Indexation

Base weight 20 (15 local, 15 blog).

| ID                       | Check            | Scope | Weight | Passing means                                                                            |
| :----------------------- | :--------------- | :---- | -----: | :--------------------------------------------------------------------------------------- |
| `crawl-robots`           | robots.txt       | site  |      2 | 200, parses into groups, no blanket `Disallow: /` for `*`, references a sitemap          |
| `crawl-sitemap`          | XML sitemap      | site  |      2 | 200, valid XML, ≥1 URL, each URL absolute and same-origin                                |
| `crawl-sitemap-coverage` | Sitemap coverage | site  |      1 | Sitemap covers the main sections found in navigation; index expanded                     |
| `crawl-indexable`        | Indexability     | page  |      3 | No `noindex`/`none` in meta robots or `X-Robots-Tag`                                     |
| `crawl-canonical`        | Canonical        | page  |      2 | Absolute, same-origin, self-referential or an inventory URL                              |
| `crawl-https`            | HTTPS            | site  |      1 | Every sampled URL is https; http redirects to https                                      |
| `crawl-host`             | Host consistency | site  |      1 | www/non-www and trailing slash resolve to one canonical host                             |
| `crawl-status`           | Status codes     | page  |      1 | Sampled pages return 200; no soft 404                                                    |
| `crawl-redirects`        | Redirects        | site  |      1 | Homepage ≤1 hop; internal links do not redirect (bounded)                                |
| `crawl-404`              | 404 handling     | site  |      1 | Unknown path returns 404, not 200                                                        |
| `crawl-url-structure`    | URL structure    | page  |      1 | Lowercase, hyphenated, ≤3 content segments, no session IDs                               |
| `crawl-index-bloat`      | Index bloat      | site  |      1 | Parameter/facet URLs are canonicalised or noindexed; no duplicate variants in the sample |
| `crawl-hreflang`         | Hreflang         | page  |    0.5 | Valid language codes, self-reference and return links; info when absent                  |
| `crawl-viewport`         | Viewport         | page  |      1 | `width=device-width, initial-scale=1`                                                    |

### 4.4 Pillar 2 — On-Page & Content

Base weight 35 (30 local/SaaS, 25 e-commerce, 40 blog).

| ID                       | Check             | Scope   | Weight | Passing means                                                                  |
| :----------------------- | :---------------- | :------ | -----: | :----------------------------------------------------------------------------- |
| `onpage-title`           | Title             | page    |      3 | Present, 30–60 characters, unique in the sample, primary topic present         |
| `onpage-description`     | Meta description  | page    |      2 | Present, 70–160 characters, unique, specific to the page                       |
| `onpage-h1`              | H1                | page    |      2 | Exactly one, non-empty, matches the page topic                                 |
| `onpage-headings`        | Heading order     | page    |    1.5 | No skipped levels; H2s structure the content                                   |
| `onpage-depth`           | Content depth     | page    |      2 | Home 300+, service 400+, category 200+, article 800+ words; thin content warns |
| `onpage-keyword-fit`     | Keyword fit       | keyword |      3 | Average field coverage across supplied keywords; info when no keywords         |
| `onpage-cannibalisation` | Cannibalisation   | site    |      2 | No two pages score within 10 points for the same keyword                       |
| `onpage-duplicate`       | Duplicate content | site    |      2 | Title/H1/body similarity below 0.8 across the sample                           |
| `onpage-alt`             | Image alt         | page    |      1 | Meaningful images have descriptive alt; decorative images use empty alt        |
| `onpage-anchors`         | Anchor text       | page    |      1 | Internal anchors describe the destination; no “click here”                     |
| `onpage-freshness`       | Freshness         | page    |      1 | Time-sensitive pages have a machine-readable date within 18 months             |
| `onpage-stuffing`        | Keyword stuffing  | page    |      1 | Top term density ≤4%; no repeated phrase in title/H1                           |
| `onpage-readability`     | Readability       | page    |    0.5 | Flesch 50–70 for prose; info for technical pages                               |
| `onpage-structure`       | Content structure | page    |      1 | Paragraphs ≤120 words; lists/tables used for scannable content                 |
| `onpage-author`          | Author / byline   | page    |    0.5 | Author name or `Person` schema on articles; info elsewhere                     |
| `onpage-trust`           | Trust pages       | site    |    0.5 | Contact, privacy and terms pages are linked                                    |
| `onpage-faq`             | Visible FAQ       | page    |    0.5 | Q&A pairs exist; `FAQPage` matches visible answers                             |

### 4.5 Pillar 3 — Architecture & Links

Base weight 15.

| ID                       | Check               | Scope | Weight | Passing means                                              |
| :----------------------- | :------------------ | :---- | -----: | :--------------------------------------------------------- |
| `links-internal`         | Internal links      | page  |      2 | ≥3 internal links per page; homepage links to key sections |
| `links-inbound`          | Inbound links       | page  |      2 | Every sampled page has ≥1 inbound link from the sample     |
| `links-depth`            | Click depth         | site  |      2 | Key pages reachable within 3 clicks from the homepage      |
| `links-broken`           | Broken links        | site  |      2 | No 4xx/5xx in up to 20 same-origin HEAD checks             |
| `links-redirect`         | Redirecting links   | site  |      1 | Internal links resolve without a redirect                  |
| `links-breadcrumbs`      | Breadcrumbs         | page  |      1 | Visible breadcrumbs or `BreadcrumbList` schema             |
| `links-nav`              | Navigation          | site  |      1 | A main nav exists and is consistent across the sample      |
| `links-orphans`          | Orphan sitemap URLs | site  |      1 | Sitemap URLs have at least one inbound link in the sample  |
| `links-anchor-diversity` | Anchor diversity    | site  |    0.5 | No single anchor text exceeds 50% for one target           |
| `links-url-depth`        | URL depth           | page  |    0.5 | Key pages are ≤3 path segments deep                        |

### 4.6 Pillar 4 — Structured Data & SERP

Base weight 20 (15 local, 25 e-commerce/SaaS/docs).

| ID                    | Check          | Scope | Weight | Passing means                                                                |
| :-------------------- | :------------- | :---- | -----: | :--------------------------------------------------------------------------- |
| `schema-jsonld`       | JSON-LD        | page  |      2 | At least one valid block with `@context` and `@type`                         |
| `schema-types`        | Schema types   | page  |      2 | Expected types for the profile are present                                   |
| `schema-depth`        | Schema depth   | page  |      2 | Required properties for the matched type are filled                          |
| `schema-organization` | Organization   | site  |    1.5 | Name, URL, logo and `sameAs` on the homepage/about page                      |
| `schema-website`      | WebSite        | site  |      1 | Name and URL; optional `potentialAction`                                     |
| `schema-breadcrumbs`  | BreadcrumbList | page  |      1 | Matches the visible breadcrumb trail                                         |
| `schema-local`        | LocalBusiness  | site  |      2 | Local profile only: subtype, NAP, hours, geo, `areaServed`                   |
| `schema-product`      | Product        | page  |      2 | E-commerce only: name, image, offers, price, availability                    |
| `schema-article`      | Article        | page  |      2 | Blog/docs only: headline, author, dates, image                               |
| `schema-faq`          | FAQPage        | page  |      1 | Matches visible Q&A; info when no FAQ                                        |
| `serp-og`             | Open Graph     | page  |      1 | `og:title`, `og:description`, `og:image`, `og:url`, `og:type`                |
| `serp-twitter`        | Twitter card   | page  |    0.5 | `summary_large_image` with title, description and image                      |
| `serp-icons`          | Icons          | site  |    0.5 | Favicon and apple-touch-icon resolve                                         |
| `serp-image`          | Social image   | page  |    0.5 | Absolute URL; HEAD reports an image; ≥1200×630 when dimensions are available |
| `schema-sameas`       | Entity links   | site  |    0.5 | Organization `sameAs` points at real social/profile URLs                     |

### 4.7 Pillar 5 — Local SEO (conditional)

Base weight 15, active for local-business profiles or strong local signals.

| ID                 | Check                   | Scope | Weight | Passing means                                                      |
| :----------------- | :---------------------- | :---- | -----: | :----------------------------------------------------------------- |
| `local-schema`     | LocalBusiness schema    | site  |      3 | Subtype plus name, address, telephone and URL                      |
| `local-nap`        | NAP consistency         | site  |      3 | Name, address and phone agree across homepage, contact and footer  |
| `local-locations`  | Location pages          | site  |      2 | Service × location coverage matches the supplied location          |
| `local-city`       | City in title/H1        | page  |      2 | Each location page names the city in title and H1                  |
| `local-areaserved` | Area served             | site  |      1 | `areaServed` includes the location pages                           |
| `local-hours`      | Opening hours           | site  |      1 | `openingHoursSpecification` or visible hours                       |
| `local-geo`        | Geo / map               | site  |      1 | `geo` coordinates or an embedded map link                          |
| `local-reviews`    | Reviews schema          | site  |      1 | `aggregateRating`/`review` present and valid; info when absent     |
| `local-doorway`    | Doorway risk            | site  |      2 | Location pages are not near-duplicates with only the city swapped  |
| `local-content`    | Local content depth     | page  |      1 | Location pages carry unique local proof, not a template            |
| `local-gbp`        | Google Business Profile | site  |      0 | Info only: not measurable from HTML; prompt the owner to verify it |
| `local-citations`  | Citations               | site  |      0 | Info only: not measurable; list the usual directories              |

### 4.8 Pillar 6 — Performance Proxies

Base weight 10 (15 e-commerce). These are static proxies, not Core Web Vitals.

| ID                 | Check               | Scope | Weight | Passing means                                       |
| :----------------- | :------------------ | :---- | -----: | :-------------------------------------------------- |
| `perf-html`        | HTML size           | page  |      1 | ≤150 KB pass, ≤300 KB warn                          |
| `perf-dom`         | DOM size            | page  |      1 | ≤1,500 nodes pass, ≤3,000 warn                      |
| `perf-blocking`    | Render-blocking     | page  |      2 | No blocking scripts in `<head>`; ≤3 stylesheets     |
| `perf-images`      | Image dimensions    | page  |      1 | Width/height present; below-fold images lazy-loaded |
| `perf-fonts`       | Font count          | page  |      1 | ≤2 families and ≤4 files                            |
| `perf-thirdparty`  | Third-party scripts | page  |      1 | ≤10 third-party scripts; domains listed             |
| `perf-compression` | Compression         | site  |      1 | `content-encoding` is br or gzip                    |
| `perf-cwv`         | Core Web Vitals     | site  |      0 | Info only: not measured; link to PageSpeed Insights |

### 4.9 Fix queue

Priority combines pillar weight, check weight and effort:

```text
impact   = pillarWeight × checkWeight
urgency  = fail ? 1 : warn ? 0.5 : 0
effort   = 1 (quick) | 2 (medium) | 3 (project)
priority = impact × urgency / effort
```

Ordering rules:

1. Site-wide blockers: `crawl-indexable`, `crawl-robots`, `crawl-sitemap`, `crawl-https`.
2. Broken links and redirect chains.
3. Duplicate/cannibalised pages before new content.
4. Title/H1/meta fixes.
5. Schema and SERP appearance.
6. Local NAP/location gaps.
7. Performance proxies.

Each fix carries a plain-language “why this matters”, the evidence URL/line, and a copy-paste snippet where one exists. Group into **Do now**, **This sprint**, **Backlog**. The page exports the queue as Markdown and JSON.

---

## 5. Keyword Readiness

### 5.1 Input

- 1–20 keywords, one per line or comma-separated, trimmed, deduped case-insensitively, max 80 characters.
- Optional location, max 80 characters. Used for local intent and city matching.
- Keywords are optional. Without them the site audit still runs and returns suggestions.

### 5.2 Suggestions (“Both”)

Manual input is always available. **Suggest from site** is deterministic and runs on the same crawl.

Sources:

- `<title>` with brand suffix removed (`|`, `—`, `-`).
- H1.
- H2/H3 phrases of 2–6 words.
- URL path segments (`/services/window-repair` → “window repair”).
- Service/product links in the main navigation.
- FAQ questions, stripped of leading question words.
- Location from the input, `LocalBusiness.address.addressLocality`, or `areaServed`.

Modifiers:

- Local: `[service] [location]`, `[service] in [location]`, `[service] near me`.
- Transactional: `[service] cost`, `price`, `quote`, `company`, `installer`.
- Commercial: `best [service] [location]`, `[service] reviews`.
- Informational: `how much does [service] cost`, `what is [service]`.

Generic stop list: home, about, contact, blog, news, services, products, pricing, privacy, terms, login, cart, checkout, search.

Suggestion score (0–100):

| Signal                               | Points |
| :----------------------------------- | -----: |
| Frequency across title/H1/H2/URL     |     30 |
| Specificity (2–4 words, not generic) |     20 |
| Service/product intent               |     20 |
| Local match                          |     15 |
| Non-generic phrasing                 |     15 |

Return up to 30 suggestions, grouped by intent, each with `evidence` (source page and heading/path). The UI shows chips with checkboxes, “select all”, “clear” and “add custom”. Copy: **“Suggested from your site, not search volume.”**

### 5.3 Intent

| Intent          | Rules                                                           |
| :-------------- | :-------------------------------------------------------------- |
| `local-service` | Location present, or “near me”, or a service term + place       |
| `transactional` | buy, price, cost, quote, book, hire, repair, install, service   |
| `commercial`    | best, top, reviews, comparison, vs                              |
| `informational` | how, what, why, guide, ideas, tips, cost (when question-shaped) |
| `navigational`  | Brand-like single token or matches the domain name              |

Intent is a badge and a matching input. It is not scored on its own.

### 5.4 Page matching

- Normalise: lowercase, NFKD, strip punctuation, collapse whitespace, basic singularisation.
- Small synonym map: window/glazing, repair/fix, cost/price, company/installer, near me/in [location].
- Remove stop words: a, an, the, in, for, near, me, and, of, to, with.
- Field weights: title 5, H1 4, URL 3, meta 2, intro 2, H2/H3 2, body 1, internal anchors 1, alt 0.5.
- Token coverage is the weighted share of keyword tokens found in each field.
- Exact phrase match adds a bonus in title, H1 and body.
- Candidate pages are the sampled pages plus any inventory URL whose path tokens overlap the keyword. Fetch up to 12 total.
- Best page wins; ties break on shallower URL and service/profile page type.
- Cannibalisation: pages within 10 points of the best and scoring ≥50.
- Uncovered: no page reaches 40, or no page covers ≥60% of tokens.

### 5.5 Readiness score

| Component                          | Points |
| :--------------------------------- | -----: |
| Target page exists and intent fits |     30 |
| Title, H1, URL, meta description   |     30 |
| Body coverage and depth            |     20 |
| Internal links and image alt       |     10 |
| Local and structured signals       |     10 |

Caps and penalties:

| Condition                                   | Effect  |
| :------------------------------------------ | :------ |
| `noindex` on the target page                | cap 35  |
| Robots-blocked target                       | cap 25  |
| Off-origin canonical                        | cap 50  |
| Non-200 target                              | score 0 |
| Thin content (<300 words on a service page) | −10     |
| Local query without city signal             | −15     |
| Cannibalised query                          | −10     |

Bands: **80+ Strong**, **60–79 Competitive**, **40–59 Weak**, **<40 Uncovered**.

Site summary:

- `coverage`: share of keywords with a dedicated page at ≥40 readiness.
- `meanReadiness`: mean of covered keywords.
- `cannibalised`: number of keywords with 2+ competing pages.
- `localCoverage`: share of local keywords with a city signal.
- No single keyword “rank”, no position, no traffic estimate.

### 5.6 Local and doorway checks

For local keywords:

- City in title and H1.
- City in the first paragraph and body.
- `LocalBusiness` schema with address, phone, `areaServed`.
- NAP consistency across homepage, contact and footer.
- A dedicated service × location page, not a homepage mention.
- Location pages must differ by more than the city token: compare body shingles after removing the city and service names. Similarity >0.85 is a doorway warning.

### 5.7 Example output

For **“Manchester window repair”**:

> Local service · high commercial intent.
> Best page: `/services/window-repair` · readiness 62 · **Competitive**.
> Missing: “Manchester” in title and H1, `areaServed`, 240 words, no link from the homepage.
> Competing page: `/repairs` targets the same query.
> Not measured: Google Business Profile, reviews, citations.

---

## 6. UI Specification

### 6.1 Header and entry

- `SiteHeader`: logo, nav, coffee, **Lewis Mode**, GitHub, deploy, workspace. The new button sits immediately after coffee, same ghost style.
- `WorkspaceHeader`: GitHub, coffee, **Lewis Mode**, home. Same position.
- Mobile: icon only, `aria-label`, `title`.
- On `/classic-seo`, the header shows `Classic SEO` as the current context and a link back to the AI workspace.
- The toggle’s active state uses a small green dot plus `aria-pressed` when the cookie is on.

### 6.2 Input and suggestions

- URL input with a bare-domain helper.
- Keywords textarea with a live count (`3 / 20`).
- Location input, optional.
- Primary button: **Run classic audit**.
- Secondary button: **Suggest from site**.
- Example preset: a local window business.
- Validation messages inline; no alert dialogs.
- While suggesting: skeleton chips. While auditing: four-step progress with elapsed time.

### 6.3 Overview

- Grade ring, score, band label.
- Coverage: pages analysed / sampled / inventory.
- Keyword coverage and mean readiness.
- Six pillar cards with score and the top failing check.
- “Do now” fixes (max 5) and a link to the full queue.
- Site classification badge and compatibility note.
- “Not measured” strip.

### 6.4 Keywords tab

- Table: keyword, intent, target page, readiness bar, band, top gap.
- Sort by readiness, intent or coverage. Default: weakest first.
- Expand a row for the detail panel:
  - Field checklist with pass/warn/fail and exact values.
  - Local signals.
  - Competing pages.
  - “What to change” with copy-paste snippets.
- Empty state when no keywords: explain manual input and the suggestion button.
- Uncovered keywords show “No dedicated page” rather than a misleading low score.

### 6.5 Pages tab

- Table: URL, status, score, title, H1, words, indexability, canonical, schema, inbound links.
- Expand for page-level checks and evidence lines.
- Filter: failing, warnings, noindex, thin, missing schema.
- The sample is labelled: “12 of 148 pages analysed”.

### 6.6 Links tab

- Summary: internal links, inbound links, click depth, broken links, redirects, orphans.
- A simple depth list (0–3+) rather than a force graph.
- Broken-link table with source page, target, status.
- Orphan table with sitemap URL and “no inbound link in sample”.

### 6.7 Schema & SERP tab

- Detected types per page, missing required properties.
- SERP preview for the homepage and selected pages: title, URL, description, favicon. No fake ranking position.
- Open Graph / Twitter card preview.
- LocalBusiness and Product panels when relevant.

### 6.8 Local tab

- NAP card: name, address, phone, consistency.
- Location coverage: service × city matrix with covered/missing/warning.
- `areaServed` vs location pages.
- Doorway-risk list.
- “Not measured”: Google Business Profile, reviews, citations, local pack.

### 6.9 Performance tab

- HTML size, DOM nodes, blocking resources, image dimensions, fonts, third-party scripts, compression.
- Clear label: **“Static proxies, not Core Web Vitals.”**
- Link to PageSpeed Insights for field data.
- No invented performance score beyond the pillar.

### 6.10 Fix queue and export

- Grouped **Do now / This sprint / Backlog**.
- Each item: check, evidence, why it matters, effort, copy-paste fix.
- Copy as Markdown, download JSON, copy a developer brief.
- Reuse the existing plain-language pattern, not the AI check copy.

### 6.11 Empty, loading and error states

- Empty: a short explanation, the honesty contract, and the window-business example.
- Loading: step labels, progress, elapsed time, cancel not required (server-bounded).
- Error: message, hint, retry; distinguish bad URL, blocked host, fetch failure, rate limit and too many keywords.
- Partial: show results with a coverage warning if the deadline hit or pages failed.

### 6.12 Responsive and accessibility

- Desktop 1440×900: two-column overview, tables, side detail.
- Mobile 390×844: stacked cards, horizontal scroll avoided, tabs become a segmented control.
- Keyboard: all rows expandable with Enter/Space; focus visible.
- Labels on every input; `aria-live="polite"` for progress and result counts.
- Colour is never the only signal: pass/warn/fail always carry text or an icon.
- Reduced motion respected.
- No layout shift when results arrive; reserve space for the summary and tables.

---

## 7. Tests

### 7.1 Core / package

- Keyword parsing: newlines, commas, duplicates, casing, length cap, count cap.
- Suggestions: title suffix stripping, URL segments, generic filtering, location modifiers, evidence.
- Intent: each rule and ambiguous cases (“window repair cost”).
- Matching: field weights, phrase bonus, synonym map, stop words, uncovered threshold.
- Readiness: component totals, caps, penalties, bands.
- Cannibalisation: two pages within 10 points; one page clear winner.
- Crawl: robots block, sitemap missing, noindex, cross-origin canonical, soft 404, URL structure.
- On-page: title/meta lengths, H1 count, depth by page type, duplicate shingles, stuffing, alt, anchors.
- Links: graph, click depth, broken HEAD results, redirects, orphans.
- Schema: JSON-LD validity, profile types, property depth, OG/Twitter, icons.
- Local: NAP extraction/consistency, location pages, city signals, doorway similarity.
- Performance: HTML size, DOM count, blocking scripts, image dimensions, fonts, third-party, compression.
- Scoring: pillar weights, profile weights, aggregated page statuses, grades, fix priority.
- Orchestration: mocked fetch end-to-end, cache reuse between suggest and audit, coverage on deadline, partial results.
- API: validation, error shapes, rate-limit cost, cache header.

### 7.2 Fixtures

Build a small window-business fixture:

```text
/                       home, LocalBusiness schema, title without “Manchester”
/services/window-repair service page, 240 words, no city, weak H1
/services/double-glazing service page, strong title/H1
/areas/manchester       location page, city in title, thin unique content
/repairs                near-duplicate of /services/window-repair
/blog/window-repair-cost article, strong depth, no author
/contact                NAP, phone, address
/privacy, /terms        trust pages
/private                noindex page
/broken                 page with an internal link to a 404
```

Keywords: “Manchester window repair”, “double glazing Manchester”, “emergency window repair”, “window repair cost”. Assert covered, uncovered, cannibalised, local gaps, and that the grade moves when the title/H1/city are fixed.

### 7.3 App / visual

- `/classic-seo` metadata is `noindex` and absent from the sitemap.
- Lewis Mode cookie sets `data-lewis`, persists across navigation, and clears on exit.
- The Classic SEO page renders classic even without the cookie (wrapper attribute).
- Header button appears in both headers, icon-only on mobile, `aria-label` present.
- Screenshots:
  - Landing header, off and on, desktop and mobile.
  - `/classic-seo` empty, suggest, results overview, keyword detail, local, performance, desktop and mobile.
  - `/app` in Lewis Mode, desktop.
- Contrast spot-check on background, panel, muted, accent, pass, warn, fail.
- No horizontal overflow at 390px.

### 7.4 CI

Before pushing: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Add the new package tests to the existing Vitest run. No live network calls in tests.

---

## 8. Rollout

1. **Lewis Mode shell** — cookie, root layout attribute, classic tokens, serif, toggle in both headers, `/classic-seo` empty state, `noindex`, sitemap test.
2. **Classic engine** — package scaffold, crawl, signals, crawl/indexation and on-page checks, scoring, fixtures.
3. **Keywords** — parsing, suggestions, intent, matching, readiness, cannibalisation, tests.
4. **Links, local, performance** — link graph and HEAD budget, NAP, location coverage, performance proxies, tests.
5. **API and UI** — POST route, forms, suggestions, overview, tabs, tables, detail panels, fix queue, not-measured, error states.
6. **Polish and PR** — plain-language copy for the top checks, accessibility, responsive passes, screenshots, README note, gameplan, PR.

Branch: `feat/classic-seo-lewis-mode`. Commit as the ABradwell identity. PR against `main` with summary, test plan and screenshots. Do not merge without the user’s explicit request.

This gameplan lives at `gameplans/v6-classic-seo.md`. The route remains unlisted even though the gameplan is in a public repository; “hidden” is a UI decision, not a secrecy guarantee.

---

## 9. Risks and Mitigations

| Risk                                                    | Mitigation                                                                           |
| :------------------------------------------------------ | :----------------------------------------------------------------------------------- |
| Scope: full audit + keywords + theme is a large release | Ship in the six phases above; keep the check registry additive                       |
| Request budget exceeds 60s                              | 12-page sample, 20 HEAD checks, 30s deadline, partial results with coverage          |
| Two engines drift or duplicate logic                    | Reuse core extractors; classic owns only checks and scoring; `classic-1` version     |
| Grade mistaken for rank                                 | Readiness copy, bands, “Not measured” panel, no position language                    |
| Local data gaps (GBP, reviews, citations)               | Info rows and explicit prompts; never invent data                                    |
| Theme overrides break contrast or layout                | Token-only overrides, screenshots, manual contrast checks, no component rewrites     |
| Cookie/SSR flash                                        | Server-set `data-lewis` from the cookie; page wrapper for direct visits              |
| Hidden route discovered and indexed                     | `noindex`, absent from sitemap/llms/OpenAPI; button link is accepted as discoverable |
| Cannibalisation false positives                         | Require both pages ≥50 and within 10 points; show evidence                           |
| Suggestion quality without volume data                  | Deterministic sources, evidence per chip, “not search volume” copy                   |
| `pnpm build` time grows with a new package              | Keep the package source-only, no separate build step, imported by the app            |

---

## 10. Out of Scope / Future

Deferred:

- Backlink index, domain authority, referring domains.
- Rank tracking, SERP scraping, keyword volume and difficulty APIs.
- Google Business Profile, reviews, citations and local pack data.
- Core Web Vitals field data, Lighthouse, CrUX.
- JavaScript rendering.
- Full-site crawl beyond the sample; log-file analysis.
- Search Console / Analytics import.
- Authentication or a truly private mode.
- CLI and GitHub Action integration for the classic engine.
- AI-generated content recommendations. Classic SEO stays deterministic.
- Deep hreflang reciprocity beyond the five-URL budget.
- Merchant Center feed validation.

Future candidates, in order:

1. Search Console CSV import for current positions and CTR.
2. Optional SERP provider (Bring Your Own Key) for competition context.
3. `llm-seo-toolbox classic` CLI command.
4. Scheduled monitoring and diffs.
5. PageSpeed Insights / CrUX integration.
6. Backlink provider integration.
7. Queued full-site crawl.

---

## 11. Acceptance Criteria

- `/classic-seo` loads, is `noindex`, and is absent from the sitemap, footer, `llms.txt` and OpenAPI.
- **Lewis Mode** appears after coffee in both headers, toggles the theme, persists via cookie and exits cleanly.
- Direct visits to `/classic-seo` render the classic theme even without the global cookie.
- Manual keywords and site-derived suggestions both work; suggestions show evidence and never claim volume.
- The audit returns six pillars, a grade, page results, keyword readiness, link graph, local panel (when relevant), performance proxies, coverage and a fix queue.
- Caps and penalties prevent a noindex or blocked page from scoring well.
- Cannibalisation and doorway risk are detected on the fixture.
- The “Not measured” panel is always visible.
- Desktop and mobile screenshots are attached to the PR.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- The existing `/api/audit`, `/app`, landing page and CLI/Action behaviour are unchanged.
