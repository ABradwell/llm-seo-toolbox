# LLMReady V5 — Answerability, Crawler Intent & Freshness

**Project Goal:** Extend the four-pillar engine from "can a crawler read the wrapper" to "does the content give a model something to answer with". V4 shipped the CLI and GitHub Action on top of the V3 checks. V5 keeps the pillars, the scoring model and the delivery surfaces, and adds the checks a site needs to be cited, not only crawled.

Three themes:

1. **Answerability.** FAQ content, answer-first structure, entity identity, page metadata and chunk-friendly sections.
2. **Crawler intent.** A refreshed bot roster split into training, search and on-demand fetch, path-aware evaluation, and a live fetch comparison that exposes WAF blocks robots.txt cannot show.
3. **Freshness and discovery.** Dates, feeds, markdown mirrors and an llms.txt that is verified against the pages it claims to index.

Everything below runs inside the existing budget: static HTML only, no headless browser, no recursive crawl, and at most three additional requests per audit beyond the sampled pages.

---

## 1. Starting Point (V4 as built)

| Pillar       | Site checks                                     | Page checks (aggregated over the sample)    |
| :----------- | :---------------------------------------------- | :------------------------------------------ |
| Discovery    | `llms-txt`, `llms-full-txt`, `sitemap`          | none                                        |
| Access       | `robots-reachable`, `ai-policy`, `bot-<id>` × 5 | `meta-robots`, `x-robots-tag`               |
| Parseability | none                                            | `h1`, `heading-order`, `snr`, `ssr-content` |
| Structured   | `openapi`, `well-known`                         | `json-ld`, `schema-types`                   |

Known weaknesses the V5 checks address:

- `schema-types` passes on any one recommended type, so `FAQPage` is recommended for three profiles and required by none.
- Every `bot-<id>` check evaluates path `/` only. A site that allows `/` and disallows `/docs/` passes.
- The roster conflates training crawlers with retrieval crawlers. The fix snippet recommends `Allow: /` for GPTBot, which is wrong advice for owners who want citations without training.
- A 403 or challenge page served to AI user agents by a WAF is invisible, because robots.txt is the only access signal read.
- Title, meta description, `lang`, dates, author and canonical are captured or ignored, never scored.
- `well-known` probes `ai-plugin.json`, a retired spec, and `security.txt`, which is unrelated to LLM readiness.
- Microdata and RDFa count as "no structured data".
- The llms.txt validator checks structure only. A manifest of dead links passes.
- The sitemap parser discards `lastmod`.

---

## 2. Architecture Changes

### 2.1 Check scope and request budget

V5 adds one new fetch class: an **agent fetch** of the homepage with an AI user agent, compared with the default fetch. Everything else reuses the seed response, the sampled page responses and the discovery bundle already in memory.

| Request                          | Count | Purpose                                                 |
| :------------------------------- | :---- | :------------------------------------------------------ |
| Homepage as `GPTBot`             | 1     | WAF and bot-management detection                        |
| Homepage as `OAI-SearchBot`      | 1     | Retrieval-intent comparison (only when GPTBot differs)  |
| Markdown probe on the focus page | 1     | `Accept: text/markdown` negotiation and `.md` sibling   |
| llms.txt link resolution         | ≤ 6   | HEAD requests, concurrency 3, 4-second budget, optional |

The llms.txt resolution is the only item that may exceed the three-request ceiling. It runs under its own deadline and degrades to "unverified" rather than delaying the audit. The CLI exposes `--no-resolve-links` to skip it.

### 2.2 New shared extractors (`packages/core/src`)

- `metadata.ts` — title, meta description, canonical, `lang`, `og:*`, `article:*`, feed links, `<link rel="alternate" type="text/markdown">`. One pass over the seed `$`, reused by the classifier and every page check.
- `entities.ts` — walks parsed JSON-LD (and the new microdata extraction) to find `Organization`, `Person`, `WebSite`, `FAQPage` and `BreadcrumbList` nodes, including nodes nested in `@graph`.
- `faq.ts` — detects visible question-and-answer pairs in the content model: a heading or `<dt>`/`<summary>` ending in `?` or starting with an interrogative, followed by ≥ 40 characters of prose before the next heading.
- `dates.ts` — collects every date signal (`datePublished`, `dateModified`, `article:published_time`, `article:modified_time`, `<time datetime>`, sitemap `lastmod`, `Last-Modified` header) and returns the freshest with its source.
- `crawlers.ts` — replaces the inline `AI_CRAWLERS` constant with a roster that carries intent. `robots.ts` keeps its parser and re-exports the roster for compatibility.

### 2.3 Data model additions (`types.ts`)

```ts
export type CrawlerIntent = "training" | "search" | "fetch";

export interface AiCrawler {
  id: string;
  label: string;
  vendor: string;
  intent: CrawlerIntent;
  note: string;
}

export interface FreshnessSignal {
  source: "json-ld" | "meta" | "time" | "sitemap" | "header";
  property: string;
  iso: string;
  line: number | null;
}

export interface AgentFetchComparison {
  userAgent: string;
  status: number;
  /** True when the AI user agent received a different status or a body under 20% of the default size. */
  blocked: boolean;
  challenge: "cloudflare" | "akamai" | "generic" | null;
}

// AuditResult additions
freshness: FreshnessSignal | null;
agentFetch: AgentFetchComparison[];
```

`AuditMeta.scoringVersion` moves from `"site-1"` to `"site-2"`. Cached results from `site-1` are invalidated on read.

### 2.4 Profile definitions (`site-types.ts`)

`SiteTypeDefinition` gains `requiredSchema` (must be present for `schema-types` to pass) and `faqExpected` (whether the FAQ check is weighted or informational).

| Profile        | `requiredSchema`                          | `recommendedSchema` additions        | `faqExpected` |
| :------------- | :---------------------------------------- | :----------------------------------- | :------------ |
| saas           | `SoftwareApplication` or `WebApplication` | `FAQPage`, `Organization`            | yes           |
| portfolio      | `Person`                                  | `ProfilePage`, `CreativeWork`        | no            |
| docs           | `TechArticle` or `APIReference`           | `FAQPage`, `BreadcrumbList`          | yes           |
| ecommerce      | `Product`                                 | `Offer`, `BreadcrumbList`, `FAQPage` | yes           |
| local-business | `LocalBusiness` (any subtype)             | `Service`, `FAQPage`                 | yes           |
| blog-media     | `Article` (any subtype)                   | `Person`, `Organization`             | no            |

---

## 3. Deliverable A: Answerability Checks

All page-scoped unless marked. Page checks aggregate through `aggregatePageChecks` like the existing eight.

### A1. `faq-content` — Visible question-and-answer content

- **Pillar:** Parseability · **Weight:** 2 where `faqExpected`, else 0.5
- **Pass:** ≥ 3 Q&A pairs on at least one sampled page, or `FAQPage` JSON-LD whose `mainEntity` answers each match on-page text (normalised, ≥ 80% token overlap).
- **Warn:** 1–2 pairs, or `FAQPage` present but answers not found in visible text.
- **Fail:** none found and `faqExpected`. **Info:** none found and not expected.
- **Evidence:** line of the first question heading, or the `FAQPage` block line.
- **Fix:** an HTML `<section>` with three `<h3>` questions and one-paragraph answers, plus the matching `FAQPage` block.
- **Plain language:** "Models answer questions by quoting a short answer under a question. Add a short FAQ to the pages people ask about most."

### A2. `answer-first` — Summary paragraph under the H1

- **Pillar:** Parseability · **Weight:** 1.5
- **Pass:** the first `<p>` inside the content scope after the H1 has 40–160 words and appears before the first H2.
- **Warn:** first paragraph exists but is under 40 words, or the first H2 arrives before any prose.
- **Fail:** no prose before the first H2.
- **Fix:** an `<h1>` followed by a one-paragraph summary.

### A3. `section-chunks` — Chunk-friendly sections

- **Pillar:** Parseability · **Weight:** 1
- Measures words between consecutive H2/H3 headings in the content scope.
- **Pass:** median section 80–500 words, no section over 1,200 words.
- **Warn:** any section over 1,200 words, or only one heading for ≥ 1,500 words of prose.
- **Fail:** ≥ 1,500 words with no H2 at all.
- **Fix:** split guidance with an outline example.

### A4. `page-metadata` — Title and description

- **Pillar:** Parseability · **Weight:** 1.5
- **Pass:** `<title>` 15–70 characters and distinct from the site name, `<meta name="description">` 50–160 characters, `<html lang>` present.
- **Warn:** any one missing or out of range.
- **Fail:** title missing, or description missing on ≥ half the sample.
- **Evidence:** line of the offending tag or the `<head>` line.

### A5. `entity-identity` — Organization or Person with `sameAs` (site scope)

- **Pillar:** Structured · **Weight:** 2.5
- Reads the homepage and any sampled page in the "Company" section (`/about`, `/team`).
- **Pass:** an `Organization` or `Person` node (JSON-LD or microdata) with `name`, `url`, `description` and ≥ 2 `sameAs` links to distinct hosts. Portfolio additionally expects `jobTitle` or `knowsAbout`.
- **Warn:** node present but fewer than two `sameAs` links, or missing description.
- **Fail:** no identity node anywhere in the sample.
- **Fix:** profile-specific JSON-LD with `sameAs` placeholders (Wikidata, LinkedIn, GitHub, Crunchbase).
- **Plain language:** "Tell models who you are in one place, and link to the same identity on other sites, so answers about you point back here."

### A6. `image-alt` — Alt text coverage

- **Pillar:** Parseability · **Weight:** 0.5 (1.5 for portfolio and ecommerce)
- Counts `<img>` inside the content scope, excluding `role="presentation"`, `alt=""` on decorative images and tracking pixels (1×1).
- **Pass:** ≥ 90% have non-empty alt ≥ 4 characters. **Warn:** 50–89%. **Fail:** under 50% with ≥ 3 images.

### A7. `citable-evidence` — Statistics and references (blog-media and saas only)

- **Pillar:** Parseability · **Weight:** 0.5 · **Status:** never below `warn`
- Counts numeric claims (number followed by `%`, a unit or a currency symbol) and outbound links in body prose.
- **Pass:** ≥ 2 numeric claims per 500 words and ≥ 1 outbound reference. **Warn:** otherwise. **Info:** other profiles.
- Documented as a heuristic in the matrix tooltip. No fix snippet; the plain-language ask is editorial.

---

## 4. Deliverable B: Crawler Intent

### B1. Roster refresh (`crawlers.ts`)

| id                   | Label              | Vendor       | Intent   |
| :------------------- | :----------------- | :----------- | :------- |
| `gptbot`             | GPTBot             | OpenAI       | training |
| `oai-searchbot`      | OAI-SearchBot      | OpenAI       | search   |
| `chatgpt-user`       | ChatGPT-User       | OpenAI       | fetch    |
| `claudebot`          | ClaudeBot          | Anthropic    | training |
| `claude-searchbot`   | Claude-SearchBot   | Anthropic    | search   |
| `claude-user`        | Claude-User        | Anthropic    | fetch    |
| `google-extended`    | Google-Extended    | Google       | training |
| `googlebot`          | Googlebot          | Google       | search   |
| `bingbot`            | Bingbot            | Microsoft    | search   |
| `perplexitybot`      | PerplexityBot      | Perplexity   | search   |
| `perplexity-user`    | Perplexity-User    | Perplexity   | fetch    |
| `applebot-extended`  | Applebot-Extended  | Apple        | training |
| `meta-externalagent` | Meta-ExternalAgent | Meta         | training |
| `amazonbot`          | Amazonbot          | Amazon       | search   |
| `ccbot`              | CCBot              | Common Crawl | training |
| `bytespider`         | Bytespider         | ByteDance    | training |

Googlebot and Bingbot are included because they are the retrieval layer behind Gemini grounding, Copilot and ChatGPT search. The roster is the single source for the landing crawler strip, the access pillar and the plain-language catalog, which already derives its `bot-<id>` keys from it.

### B2. `bot-<id>` becomes path-aware

Each crawler is evaluated against `/` **and** every sampled page path. The check reports the worst outcome and lists blocked paths in `sample.affected`. Summary moves from "Allowed by wildcard" to "Allowed · 8/8 sampled paths".

### B3. Intent-grouped scoring

The access pillar gains three synthetic checks that replace the flat list in the score (the individual `bot-<id>` rows stay visible with weight 0):

| id                | Label                        | Weight | Pass condition                                                                                                                                           |
| :---------------- | :--------------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access-search`   | Search and citation crawlers | 3      | every `search` crawler allowed on all sampled paths                                                                                                      |
| `access-fetch`    | On-demand fetch agents       | 2      | every `fetch` crawler allowed on all sampled paths                                                                                                       |
| `access-training` | Training crawlers            | 1      | **Pass** when the policy is explicit either way. **Warn** only when inherited from a wildcard. Blocking training is a legitimate choice and never fails. |

The `ai-policy` fix snippet is rewritten to show the three groups with comments, defaulting training to `Allow` but noting that `Disallow` is a valid choice.

### B4. `agent-fetch` — Live fetch comparison (site scope)

- **Pillar:** Access · **Weight:** 3
- Fetches the homepage with the GPTBot user agent string. Compares status and body size with the default fetch. If blocked, fetches once more as OAI-SearchBot to tell "blocks training" from "blocks everything".
- **Pass:** both fetches return the same status and a body within 20% of the default.
- **Warn:** GPTBot blocked, OAI-SearchBot allowed (training-only block, consistent with robots intent).
- **Fail:** OAI-SearchBot blocked, or a challenge page detected (`cf-mitigated` header, `cf-chl` markers, Akamai `_abck`, generic "verify you are human").
- **Evidence:** `HTTP response headers` with the status line and the challenge marker.
- **Fix:** a short runbook per vendor: the Cloudflare "AI bots" toggle, Akamai Bot Manager allowlist, generic WAF rule by user agent.
- **Plain language:** "Your firewall is turning AI crawlers away before they read robots.txt. Allow the search and fetch agents in the firewall, not only in robots.txt."

### B5. `content-signal` — Cloudflare Content-Signal directive

- **Pillar:** Access · **Weight:** 0.5 · **Status:** `pass` or `info`
- Parses `Content-Signal:` lines in robots.txt (`search`, `ai-input`, `ai-train`). Reports the declared values and flags a conflict when `search=no` while search crawlers are allowed, or `ai-train=yes` while every training crawler is disallowed.

### B6. Directive parser additions (`directives.ts`)

`max-snippet:0` joins the restrictive set. `max-snippet:-1` and `max-image-preview:large` are reported as permissive signals in the detail text.

---

## 5. Deliverable C: Freshness & Discovery

### C1. `freshness` — Last-updated signal (page scope, aggregated)

- **Pillar:** Discovery · **Weight:** 1.5 (2.5 for blog-media and docs)
- Collects every date signal per page through `dates.ts`.
- **Pass:** at least one machine-readable modified date within 18 months, and the sitemap `lastmod` (when present) agrees within 7 days of the page signal.
- **Warn:** only a published date, or the freshest signal is 18–36 months old, or sitemap `lastmod` disagrees by more than 30 days.
- **Fail:** no date signal at all on a blog-media or docs page. **Info:** no signal on other profiles.
- **Evidence:** line of the date tag or `/sitemap.xml` entry.

The sitemap parser keeps `lastmod` per URL, and the `sitemap` check gains a detail line reporting the share of URLs with a `lastmod`.

### C2. `feed` — RSS or Atom feed (site scope)

- **Pillar:** Discovery · **Weight:** 1 (blog-media), 0.5 (docs, saas), `info` elsewhere
- **Pass:** `<link rel="alternate">` with an RSS, Atom or JSON Feed type that resolves to a non-HTML body with ≥ 1 item. **Warn:** link present but unverifiable. **Fail/Info:** none.

### C3. `markdown-mirror` — Markdown for agents (site scope, probed on the focus page)

- **Pillar:** Discovery · **Weight:** 1.5 for docs and saas, `info` elsewhere
- Probe order, stop at first hit: `Accept: text/markdown` on the focus page (content-type `text/markdown` or `text/x-markdown`), then `<link rel="alternate" type="text/markdown">`, then the `.md` sibling path.
- **Pass:** any probe returns markdown whose first heading matches the page H1. **Warn:** markdown returned but unrelated or empty. **Info:** not offered.
- **Fix:** a framework-neutral snippet for content negotiation plus a note on `.md` siblings.

### C4. `llms-txt` link resolution and coverage

- Extends the existing check rather than adding a new id. After structural validation, HEAD-request up to six links (first two per section) under a 4-second budget.
- **Downgrade to warn** when any resolved link returns 4xx/5xx or lands off-origin without being declared external.
- **Detail** adds coverage: share of sampled pages referenced by the manifest, and share of manifest links that appear in the sitemap. Coverage under 25% of sampled pages is a warn.
- `LlmsTxtValidation` gains `resolved: { url; status; ok }[]` and `coverage: { sampled: number; sitemap: number }`.

### C5. Canonical check — `canonical` (page scope)

- **Pillar:** Discovery · **Weight:** 1
- **Pass:** `<link rel="canonical">` present, absolute, same origin, and either self-referential or pointing at a URL in the inventory.
- **Warn:** missing, or relative. **Fail:** canonical points off-origin or at a 4xx (checked only when the target is in the sample).

---

## 6. Deliverable D: Structured Data Depth

### D1. Microdata and RDFa extraction

`extractJsonLd` becomes `extractStructuredData` and also walks `[itemscope]` nodes (`itemtype` → type, `itemprop` → properties, one level deep) and `typeof`/`property` attributes. `JsonLdReport` is renamed `StructuredDataReport` with a `format: "json-ld" | "microdata" | "rdfa"` per node. `json-ld` keeps its id for compatibility but its label becomes "Structured data presence & syntax"; microdata-only pages score `warn` with a recommendation to add JSON-LD.

### D2. `schema-types` uses `requiredSchema`

- **Pass:** a `requiredSchema` type is present (subtype matching through a small schema.org hierarchy table: `LocalBusiness` subtypes, `Article` subtypes, `Product` subtypes).
- **Warn:** only recommended types present, or required type present with none of the recommended ones on a profile where `faqExpected`.
- **Fail:** valid structured data with no matching type, or none at all.

### D3. `schema-depth` — Required properties per type (page scope)

- **Pillar:** Structured · **Weight:** 1.5
- A property table per type, scored as the share of required properties present on the primary node:

| Type                 | Required properties                                                                           |
| :------------------- | :-------------------------------------------------------------------------------------------- |
| Article and subtypes | `headline`, `author`, `datePublished`, `dateModified`, `publisher`                            |
| Product              | `name`, `description`, `image`, `offers.price`, `offers.priceCurrency`, `offers.availability` |
| SoftwareApplication  | `name`, `applicationCategory`, `operatingSystem`, `offers`                                    |
| LocalBusiness        | `name`, `address`, `telephone`, `openingHoursSpecification`, `geo`                            |
| Person               | `name`, `jobTitle`, `url`, `sameAs`                                                           |
| TechArticle          | `headline`, `dateModified`, `proficiencyLevel` or `about`                                     |
| FAQPage              | `mainEntity[]` with `name` and `acceptedAnswer.text`                                          |

- **Pass:** ≥ 80% present. **Warn:** 40–79%. **Fail:** under 40%.
- **Evidence:** the node's block line. **Fix:** the node re-emitted with the missing properties as placeholders.

### D4. `breadcrumbs` — BreadcrumbList (page scope)

- **Pillar:** Structured · **Weight:** 0.5
- **Pass:** a `BreadcrumbList` whose last item matches the page URL. **Warn:** present but mismatched. **Info:** absent on the homepage. **Warn:** absent on pages two or more segments deep.

### D5. `well-known` rewrite

- Drops `ai-plugin.json`. Probes `/.well-known/api-catalog` (RFC 9727, scored for saas and docs when `openApiRelevant`) and keeps `security.txt` as `info` only. Weight stays 0.5. The OpenAPI probe also accepts any `application/linkset+json` entry from the catalog as a pointer.

---

## 7. Scoring Changes

- `scoringVersion` becomes `"site-2"`.
- New page checks join `PARSEABILITY_IDS`, `STRUCTURED_IDS` and a new `DISCOVERY_IDS` group in `aggregate.ts`. `PageCheckGroups` gains a `discovery` array.
- Pillar weights are unchanged (equal average). Inside each pillar the new weights above are tuned so a site that passed V4 cleanly lands at roughly 70–75 under V5 if it has no FAQ, no identity node and no dates. The fixtures in `fixtures.ts` are re-baselined and the landing "live checklist" lists the new ids.
- `bot-<id>` rows carry weight 0 so they do not double count with the intent groups.
- Checks marked `info` continue to be excluded from the pillar average.

### Grade expectations after V5

| Site shape                                            | V4 grade | V5 grade |
| :---------------------------------------------------- | :------- | :------- |
| Docs site with llms.txt, JSON-LD, open robots, no FAQ | A        | B        |
| Portfolio with Person schema and sameAs, no llms.txt  | C        | B        |
| SaaS behind Cloudflare AI block, clean robots.txt     | A        | D        |
| Blog with Article schema, dates, feed, no llms.txt    | C        | B        |

---

## 8. Surface Updates

- **Workspace matrix.** New rows render through the existing component. The access pillar groups `bot-<id>` rows under their intent heading, collapsed by default.
- **Plain-language catalog.** One entry per new id in `plain-language.ts`, following the `problem` / `explainer` / `owner` / `asks` shape. The FAQ, identity and firewall entries are written first because they carry the most weight.
- **Sampled pages tab.** Adds freshness and FAQ columns.
- **Landing crawler strip.** Reads intent from the roster and renders three groups.
- **CLI.** `--no-resolve-links` and `--no-agent-fetch` flags. `summary` and `brief` formats surface the three intent groups and the firewall result.
- **GitHub Action.** New inputs `resolve-links` and `agent-fetch`, both default `"true"`. The sticky comment gains an "Access by intent" line.
- **README.** The check count moves from 20 to 36, and the pillar table is regenerated.

---

## 9. Directory Additions

```text
packages/core/src/
├── crawlers.ts            # Roster with intent; robots.ts re-exports AI_CRAWLERS
├── metadata.ts            # Title, description, canonical, lang, og, feeds, md alternates
├── entities.ts            # Organization / Person / FAQPage / BreadcrumbList discovery
├── faq.ts                 # Visible Q&A pair detection
├── dates.ts               # Freshness signal collection
├── structured-data.ts     # JSON-LD + microdata + RDFa extraction (moved from page-audit.ts)
├── schema-depth.ts        # Required-property tables and subtype hierarchy
├── agent-fetch.ts         # AI user-agent fetch comparison and challenge detection
└── *.test.ts              # One suite per module above
gameplans/
└── v5-answerability.md    # This document
```

---

## 10. Out of Scope

- **Off-site presence.** Wikipedia, Reddit, G2 and review-site coverage shape citations but cannot be audited from the target origin. The plain-language brief may mention them as editorial advice; no check scores them.
- **Rendered-DOM checks.** No headless browser. A client-rendered FAQ accordion is still invisible, and `ssr-content` already reports why.
- **Full-site crawl.** The sample stays at eight pages plus the focus page.
- **Bot verification.** The agent fetch sends a user-agent string only. It does not spoof verified IP ranges, so sites that verify by reverse DNS will show as blocked. The check detail says so.
- **Language-specific NLP.** The FAQ and answer-first heuristics are punctuation and length based. Interrogative lists cover English only in V5; other languages fall back to the `?` rule.
- **Schema.org validation against the full vocabulary.** Only the required-property tables in D3 are enforced.

---

## 11. Execution Roadmap

1. **Phase 1 — Extractors and data model.** `metadata.ts`, `structured-data.ts`, `dates.ts`, `entities.ts`, `faq.ts`, `crawlers.ts`; `types.ts` additions; `scoringVersion` bump; fixtures re-baselined. No score changes shipped yet.
2. **Phase 2 — Answerability.** A1 `faq-content`, A2 `answer-first`, A4 `page-metadata`, A5 `entity-identity`, D2 `schema-types` with `requiredSchema`. Plain-language entries for each. This phase is the first user-visible release.
3. **Phase 3 — Crawler intent.** B1 roster, B2 path-aware evaluation, B3 intent groups, B4 `agent-fetch`, B5 `content-signal`, B6 directive additions. CLI and Action flags.
4. **Phase 4 — Freshness and discovery.** C1 `freshness`, C2 `feed`, C3 `markdown-mirror`, C4 llms.txt resolution, C5 `canonical`.
5. **Phase 5 — Structured depth.** D1 microdata, D3 `schema-depth`, D4 `breadcrumbs`, D5 `well-known` rewrite, A3 `section-chunks`, A6 `image-alt`, A7 `citable-evidence`.
6. **Phase 6 — Surfaces and docs.** Matrix grouping, sampled pages columns, crawler strip, README, screenshots, dogfooding threshold reviewed against the new score.

Each phase ships as its own pull request against `main`, with the existing CI checks and new unit suites. Phases 2 through 5 each include at least one recorded-HTML fixture per new check for both the pass and fail paths.

---

## 12. Acceptance Criteria

- Every new check has a stable id, a protocol string, evidence with a line number where a source exists, a fix snippet where a fix is mechanical, and a plain-language entry.
- A V4 audit result deserialises and re-scores under V5 without error (cache invalidation path tested).
- Audit wall-clock on the existing presets (`docs.python.org`, `nextjs.org`, `stripe.com/docs`, `tailwindcss.com`) stays under the current `SAMPLE_DEADLINE_MS` plus 5 seconds with link resolution and agent fetch enabled.
- The three illustrative sites in section 7 land within one grade of the table.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass on every phase PR.
