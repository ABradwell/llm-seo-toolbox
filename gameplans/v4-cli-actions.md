# LLMReady V4 — CLI & GitHub Action Scope & Architecture Specification

**Project Goal:** Extend the LLMReady engine into developer workflows by providing:

1. `@llmready/cli`: A fast, zero-dependency Node.js/TypeScript CLI to execute site compatibility audits locally or in scripts.
2. `llmready/action`: A GitHub Action wrapper to automatically run LLM audits on PRs/commits, post detailed markdown summaries to pull requests, and fail CI pipelines if compliance thresholds are missed.
3. **Internal Dogfooding**: Integrate the action directly into this repository's own GitHub Actions CI pipeline.

---

## 1. Ecosystem Architecture

```
                       +-------------------------------+
                       |  @llmready/core (Shared Engine)|
                       |  - Site Classifier            |
                       |  - 4-Pillar Analyzer          |
                       +---------------+---------------+
                                       |
              +------------------------+------------------------+
              |                                                 |
              v                                                 v
   +-----------------------+                         +-----------------------+
   |    @llmready/cli      |                         |    llmready/action    |
   | (Command-Line Utility)|                         |    (GitHub Action)    |
   +-----------+-----------+                         +-----------+-----------+
               |                                                 |
               v                                                 v
  Local Terminal Execution                         GitHub PR Comments & Status
  (JSON / Table / Markdown)                        Threshold Gate (Fail on Grade)
```

To maintain code reuse between the Next.js web workspace, the CLI, and the GitHub Action, the core classification and auditing engines (`classifier.ts` and `analyzer.ts`) are modularized under `packages/core` or `src/lib/core`.

---

## 2. Deliverable A: CLI Package (`@llmready/cli`)

### Package Specifications

- **Executable Name:** `llmready` (e.g., `npx @llmready/cli https://example.com`)
- **Environment:** Node.js 18+ (ESM & CJS compatibility via `tsup`)
- **Dependencies:** Minimal footprint (`commander` or `cargs`, `picocolors`, `cli-table3`)

### Command-Line Arguments & Flags

```bash
llmready <url> [options]
```

| Flag                    | Short | Default            | Description                                                                                   |
| :---------------------- | :---- | :----------------- | :-------------------------------------------------------------------------------------------- |
| `--format <type>`       | `-f`  | `table`            | Output format: `table`, `json`, `markdown`, `summary`                                         |
| `--min-score <number>`  | `-s`  | `0`                | Minimum composite score required to pass (0–100)                                              |
| `--min-grade <grade>`   | `-g`  | `F`                | Minimum grade required to pass (`A`, `B`, `C`, `D`, `F`)                                      |
| `--config <path>`       | `-c`  | `.llmreadyrc`      | Path to custom configuration file                                                             |
| `--site-type <type>`    | `-t`  | `auto`             | Override auto-classifier (`saas`, `portfolio`, `docs`, `ecommerce`, `local_business`, `blog`) |
| `--output <file>`       | `-o`  | `stdout`           | Write audit output to file path                                                               |
| `--timeout <ms>`        |       | `10000`            | Request timeout in milliseconds                                                               |
| `--user-agent <string>` |       | `LLMReady-CLI/4.0` | Custom User-Agent header for audit requests                                                   |
| `--verbose`             | `-v`  | `false`            | Show detailed debug log of audit checks                                                       |

### CLI Output Modes

#### 1. Rich Terminal Table Format (`--format table`)

```text
  ██╗     ██╗     ███╗   ███╗██████╗ ███████╗██████╗ ██╗   ██╗
  ██║     ██║     ████╗ ████║██╔══██╗██╔════╝██╔══██╗╚██╗ ██╔╝
  ██║     ██║     ██╔████╔██║██████╔╝█████╗  ██████╔╝ ╚████╔╝
  ██║     ██║     ██║╚██╔╝██║██╔══██╗██╔══╝  ██╔══██╗  ╚██╔╝
  ███████╗███████╗██║ ╚═╝ ██║██║  ██║███████╗██║  ██║   ██║

 Target URL:   https://example.com
 Site Type:    SaaS (Auto-detected)
 Overall Score: 88 / 100 (Grade: A)

┌───────────────────────────────┬────────┬────────┬──────────────────────────────────────────┐
│ Pillar                        │ Score  │ Status │ Notes                                    │
├───────────────────────────────┼────────┼────────┼──────────────────────────────────────────┤
│ Discovery & Manifests         │ 100/100│ PASS   │ Valid /llms.txt, unpaginated bundle     │
│ Crawler Access (RFC 9309)     │  80/100│ WARN   │ Bytespider blocked in wildcard group     │
│ Static Parseability & SNR     │  90/100│ PASS   │ SNR 72%, Initial SSR 1,420 chars         │
│ Machine Interfaces            │  85/100│ PASS   │ Valid JSON-LD (SoftwareApplication)      │
└───────────────────────────────┴────────┴────────┴──────────────────────────────────────────┘
```

#### 2. Machine-Readable JSON Output (`--format json`)

Outputs a complete JSON payload ideal for pipes, continuous integration tools, or custom data ingestion.

```json
{
  "url": "https://example.com",
  "timestamp": "2026-10-21T21:13:00.000Z",
  "siteType": "saas",
  "detectedType": "saas",
  "score": 88,
  "grade": "A",
  "pillars": {
    "discovery": { "score": 100, "status": "pass" },
    "crawlerAccess": { "score": 80, "status": "warn" },
    "staticParseability": { "score": 90, "status": "pass" },
    "machineInterfaces": { "score": 85, "status": "pass" }
  },
  "checks": [
    {
      "id": "llms-txt-presence",
      "name": "llms.txt manifest",
      "pillar": "discovery",
      "score": 100,
      "status": "pass",
      "observed": "Served as plain text with 1 H1 and blockquote summary"
    }
  ]
}
```

### Process Exit Codes

- **`0` (Success)**: Scan completed successfully AND score/grade meets or exceeds specified `--min-score` / `--min-grade`.
- **`1` (Threshold Failed)**: Scan completed successfully, but score/grade fell below `--min-score` or `--min-grade`.
- **`2` (Audit Error)**: Target domain unreachable, DNS resolution failed, invalid URL format, or execution timed out.

---

## 3. Deliverable B: GitHub Action (`llmready/action`)

### Overview

A custom composite or Docker-based GitHub Action (`action.yml`) that wraps `@llmready/cli`. It executes against deployed preview URLs or production domains, generates pull request comments, and sets GitHub commit check statuses.

### Action Configuration Parameters (`action.yml`)

```yaml
name: "LLMReady Compatibility Audit"
description: "Audit website for AI crawler access, /llms.txt validity, and structural parseability."
inputs:
  url:
    description: "Target URL to audit (e.g., https://preview.example.com)"
    required: true
  min-score:
    description: "Minimum required score (0-100) to pass check"
    required: false
    default: "75"
  min-grade:
    description: "Minimum required grade (A, B, C, D) to pass check"
    required: false
    default: "B"
  site-type:
    description: "Force specific site classification (auto, saas, portfolio, docs, ecommerce)"
    required: false
    default: "auto"
  comment-on-pr:
    description: "Automatically post or update a markdown audit report on the PR"
    required: false
    default: "true"
  github-token:
    description: "GitHub token used for posting PR comments"
    required: false
    default: ${{ github.token }}
outputs:
  score:
    description: "Composite LLM compatibility score (0-100)"
  grade:
    description: "Composite letter grade (A-F)"
  passed:
    description: 'Boolean ("true" or "false") indicating threshold pass status'
  report-json:
    description: "JSON-serialized audit payload"
```

### Auto-Generated PR Markdown Comment Output

When `comment-on-pr: true` is set, the action posts or updates a stickied comment on the active Pull Request:

```markdown
## 🤖 LLMReady Audit Results

| Metric              | Result       | Target Threshold | Status  |
| :------------------ | :----------- | :--------------- | :------ |
| **Composite Score** | **88 / 100** | $\ge 75$         | ✅ PASS |
| **Grade**           | **A**        | $\ge \text{B}$   | ✅ PASS |
| **Detected Type**   | `saas`       | Dynamic Profile  | ℹ️ AUTO |

### Pillar Breakdown

- **Discovery & Manifests**: 100% (Pass)
- **Crawler Access (RFC 9309)**: 80% (Warn: `Bytespider` blocked)
- **Static Parseability**: 90% (Pass: SSR payload = 1,420 chars)
- **Machine Interfaces**: 85% (Pass: Valid `SoftwareApplication` JSON-LD)

<details>
<summary>🔍 View Detailed Check Findings</summary>

| Check                 | Pillar     | Status  | Observed                                                |
| :-------------------- | :--------- | :------ | :------------------------------------------------------ |
| `llms.txt manifest`   | Discovery  | ✅ Pass | Plain text, 1 H1, blockquote summary                    |
| `OpenAPI description` | Interfaces | ⚠️ Warn | `/openapi.json` missing (Optional for detected profile) |

</details>

_Report generated by [llmready/action](https://github.com/llmready/action)._
```

---

## 4. Deliverable C: Repository Dogfooding Integration

The LLMReady repository will use its own GitHub Action to audit its production site (`https://llmready.dev`) and preview deployments on every Pull Request.

### Workflow File: `.github/workflows/llmready-audit.yml`

```yaml
name: LLMReady Compatibility Quality Gate

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  audit:
    name: Run LLMReady Site Audit
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Dependencies
        run: corepack enable && pnpm install --frozen-lockfile

      - name: Build CLI Package
        run: pnpm --filter @llmready/cli build

      - name: Audit Production Site
        uses: ./actions/audit # Dogfooding local repo action
        with:
          url: "https://llmready.dev"
          min-score: "80"
          min-grade: "B"
          comment-on-pr: "true"
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

---

## 5. Directory Architecture Additions

```text
llm-ready/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # ESLint, Prettier, Vitest, Gitleaks
│       └── llmready-audit.yml     # Self-auditing dogfooding pipeline
├── actions/
│   └── audit/
│       ├── action.yml             # GitHub Action manifest
│       └── index.js               # Action entry point
├── packages/
│   ├── core/                      # Extracted modular auditing core
│   │   ├── src/
│   │   │   ├── analyzer.ts
│   │   │   └── classifier.ts
│   │   └── package.json
│   └── cli/                       # @llmready/cli package
│       ├── src/
│       │   ├── index.ts           # CLI entrypoint & commander configuration
│       │   ├── formatters/        # Table, JSON, Markdown renderers
│       │   └── config.ts          # .llmreadyrc loader
│       ├── package.json
│       └── tsup.config.ts
├── .llmreadyrc.example            # Sample configuration file
├── SITE_PLAN_V3.md
└── PROJECT_SCOPE_V4_CLI_CI.md
```

---

## 6. Execution Roadmap

1. **Phase 1: Package Refactoring**: Modularize `classifier.ts` and `analyzer.ts` into `@llmready/core`.
2. **Phase 2: CLI Development**: Implement `@llmready/cli` executable, arguments, threshold checks, and table/json formatters.
3. **Phase 3: GitHub Action Creation**: Construct `actions/audit/action.yml` with PR commenting capabilities and status checks.
4. **Phase 4: Dogfooding & Integration**: Add `.github/workflows/llmready-audit.yml` to validate `llmready.dev` continuously on every PR.

```

I have created `PROJECT_SCOPE_V4_CLI_CI.md` outlining the architecture, CLI flags, output formats, GitHub Action parameters, and dogfooding workflow for LLMReady V4.

---

## As built (this repository)

This plan was written before the current `main` was inspected, so the shipped
names and layout follow the repository, not the draft. What changed:

- **Naming.** The CLI, action and workspace packages are `llm-seo-toolbox`, not
  `llmready`. Packages are `@llm-seo-toolbox/core`, `@llm-seo-toolbox/cli` and
  `@llm-seo-toolbox/action`; the executable is `llm-seo-toolbox`. The existing
  web product brand is unchanged.
- **Core extraction.** The engine lives in `packages/core` as TypeScript source
  shared through a pnpm workspace. The Next.js app keeps thin re-exports in
  `src/lib` and `src/types/audit.ts`, and retains the `server-only` guard, so no
  application imports changed.
- **CLI.** No CLI framework dependencies: the argument parser, ANSI palette and
  Unicode table renderer are built in. `tsup` bundles the workspace core;
  `cheerio` and `node-html-markdown` stay external. Output formats are `table`,
  `json`, `markdown` and `summary`; config discovery covers
  `llm-seo-toolbox.config.json`, `.llmseotoolboxrc` and `.llmseotoolboxrc.json`.
- **Action.** `actions/audit` is a bundled Node 20 JavaScript action
  (`dist/index.cjs`, built by `pnpm build:action`), not Docker or composite. It
  writes the job summary, keeps one sticky PR comment up to date, exposes
  `score`, `grade`, `passed` and `report-json` outputs, and exits non-zero when
  the gate fails.
- **Dogfooding.** The pipeline audits the Vercel preview deployment for each pull
  request head commit and waits for the production deployment for each `main`
  push, resolved from the Vercel REST API, then audits the production deployment
  at `https://llm-seo-toolbox.vercel.app` on `main` and manual runs (overridable
  with the `LLM_SEO_TOOLBOX_AUDIT_URL` repository variable). Both gates require
  a minimum of 80 points and grade B, because `llmready.dev` belongs to an
  unrelated product.

```
