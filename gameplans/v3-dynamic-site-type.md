# PROJECT SCOPE V3 — Full Specification

### 1. Core Architecture & Tech Stack

- **Framework:** Next.js 15 (App Router, Server Components) for fast SSR execution and lightweight API routes.
- **UI Components:** Tailwind CSS v4 + shadcn/ui. Dark slate palette (`#09090b`), dense monospace typography, and tight 4px radii (`rounded-sm`).
- **Package Manager:** `pnpm`
- **Hosting & CI/CD:** Vercel with automated preview deployments.
- **Code Quality & Security:** Husky pre-commit hooks, `lint-staged`, Prettier, ESLint, and Gitleaks secret protection.

---

### 2. Deliverables & Features

#### Deliverable A: Automatic Site-Type Classifier (`src/lib/classifier.ts`)

- **Under 100ms Heuristic Pipeline:**

1. **JSON-LD Inspection:** Checks `@type` signals (`Person`, `MusicGroup`, `SoftwareApplication`, `LocalBusiness`, `Article`).
2. **Route & DOM Heuristics:** Regex scans for `/docs/`, `/api/`, `/checkout/`, `<pre><code>`, audio/video embeds.
3. **Meta & OpenGraph Checks:** Evaluates `og:type` (`article`, `product`, `profile`, `website`).

- **Dynamic Profile Assignment:** Categorizes target into 1 of 6 types (`SaaS`, `Portfolio`, `Docs`, `E-Commerce`, `Local Business`, `Blog/Media`) to dynamically suppress false-positive warnings (e.g., disabling OpenAPI checks for creative portfolios).

#### Deliverable B: 4-Pillar Audit Engine (`src/lib/analyzer.ts`)

1. **Discovery & Manifests:** Strict `/llms.txt` validation (single H1, blockquote summary, H2 sections, markdown links, no pagination markers), `/llms-full.txt` check (>50 B unpaginated), and `sitemap.xml` declaration linkage in `robots.txt`.
2. **Crawler Access (RFC 9309):** `robots.txt` parsing across explicit AI user-agent groups (`Google-Extended`, `ClaudeBot`, `GPTBot`, `PerplexityBot`, `Bytespider`), `<meta name="robots">` / `googlebot` checks, and `X-Robots-Tag` header evaluation.
3. **Static Parseability & SNR:** Single content-region H1, non-skipping heading hierarchy, $\ge 65\%$ static HTML signal-to-noise ratio, and $\ge 600$ characters SSR un-hydrated text payload validation.
4. **Structured Machine Interfaces:** Validates `application/ld+json` syntax, enforces contextual schema types, and conditionally audits `/openapi.json` and `.well-known` endpoints based on site classification.

#### Deliverable C: Two-Step UI Flow

- **Step 1: Landing Page (`/`):** Clean search prompt bar for domain entry, developer standards highlights (`/llms.txt`, RFC 9309), and open-source footer (Buy Me a Coffee widget, GitHub star button, GPL-3.0 license).
- **Step 2: Tool Workspace (`/app`):** Top navigation bar with URL switcher, real-time 0–100 score indicator (Grade A–F), export JSON controls, detailed audit table, interactive `/llms.txt` builder tab, and side-by-side LLM Vision simulator tab.

---

### 3. File Directory Structure

- `.github/workflows/` — CI pipeline (ESLint, Prettier, Vitest, Gitleaks).
- `.husky/pre-commit` — Local pre-commit hook running `lint-staged` and `gitleaks protect`.
- `src/app/page.tsx` — Step 1: Landing Page.
- `src/app/app/page.tsx` — Step 2: Tool Workspace.
- `src/app/api/audit/` — Backend audit evaluation route.
- `src/lib/classifier.ts` — Dynamic site-type classification logic.
- `src/lib/analyzer.ts` — Core audit runner (RFC 9309, llms.txt, SNR, JSON-LD).
- `SITE_PLAN_V3.md` — Complete architecture specification.
- `README.md` — Setup instructions, Vercel setup guide, Buy Me a Coffee button.

---

### 4. Out-of-Scope (Deferred to Future Releases)

- **Paid Tier / User Accounts:** Tool remains 100% open-source and public without login.
- **Recursive Scrapes:** Audits target URL and root manifest endpoints (`/llms.txt`, `robots.txt`, `sitemap.xml`) only to guarantee sub-3-second scans.
- **Headless Browser Execution:** Evaluates initial static HTML payloads only to accurately simulate fast AI crawler parsers.

---

### 5. Execution Roadmap

1. **Phase 1 — Scaffolding:** Initialize Next.js 15, `pnpm`, Husky, Prettier, ESLint, and `.gitleaks.toml`.
2. **Phase 2 — Core Engine:** Implement `src/lib/classifier.ts` and `src/lib/analyzer.ts`.
3. **Phase 3 — UI Layer:** Build Step 1 landing page and Step 2 workspace using shadcn/ui.
4. **Phase 4 — Documentation & Launch:** Finalize `README.md` with Vercel setup steps and Buy Me a Coffee integration.
