# LLMReady (V2) — Technical Product & Architecture Specification

An open-source developer utility for auditing, validating, and optimizing websites for Gemini, Claude, and AI search crawlers.

---

## 1. Core Focus & Spec Compliance

Unlike generic scoring platforms, LLMReady focuses strictly on published web standards and AI discovery protocols:

1. **Answer.ai `/llms.txt` & `/llms-full.txt` Standard**: Validates markdown index structure, unpaginated context bundles, and content accessibility.
2. **RFC 9309 Robots Exclusion Protocol**: Evaluates `robots.txt` rules for AI user-agents (`Google-Extended`, `ClaudeBot`, `GPTBot`, `PerplexityBot`, `Bytespider`).
3. **Gemini / Search Grounding Parseability**: Measures static HTML signal-to-noise ratio (SNR), heading hierarchy, and JSON-LD schema metadata (`TechArticle`, `FAQPage`, `SoftwareApplication`).

---

## 2. User Experience & Architecture (Two-Step Flow)

### **Step 1: Landing / Direct Audit Input (`/`)**

- **Hero Section**: Crisp, high-density search bar allowing instant domain audits (`https://example.com`).
- **Live Specification Checklist**: Replaces abstract bento grids with an inline audit checklist showing real-time checks across Discovery, Access, and Structure.
- **Standard Presets**: One-click test targets for major open-source documentation sites (`Next.js`, `Python Docs`, `Stripe API`, `Tailwind`).
- **Header & Footer**: Clean monospace navigation linking to GitHub, RFC 9309 specs, Vercel deploy instructions, and a **Buy Me a Coffee** support button.

### **Step 2: Interactive Workspace (`/app`)**

- **Audit Matrix Tab**: Granular pass/warning/fail checks with exact line numbers and code-level resolution steps.
- **`llms.txt` Builder Tab**: Interactive editor to construct, validate, preview, and download standard-compliant `/llms.txt` files.
- **LLM Vision Simulator Tab**: Side-by-side comparison showing raw HTML vs. clean extracted Markdown as processed by Gemini scrapers.

---

## 3. Audit Engine Specification

| Category            | Protocol / Standard     | Specific Checks Performed                                                                                                                                            |
| :------------------ | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Discovery**       | `/llms.txt` Standard    | • `/llms.txt` accessibility & H1 title check<br>• `/llms-full.txt` unpaginated file presence<br>• `sitemap.xml` presence & directive in `robots.txt`                 |
| **Access Rules**    | RFC 9309 (`robots.txt`) | • Explicit allow/block status for `Google-Extended` (Gemini)<br>• Explicit allow/block status for `ClaudeBot`, `GPTBot`<br>• `X-Robots-Tag` HTTP header evaluation   |
| **Parseability**    | Semantic HTML & SSR     | • Heading sequence (`h1` -> `h2` -> `h3`) without skips<br>• Text-to-DOM Signal-to-Noise Ratio (SNR > 65%)<br>• Initial SSR payload readability without JS hydration |
| **Structured Data** | Schema.org JSON-LD      | • JSON-LD presence & syntax validity<br>• OpenAPI spec availability (`/openapi.json`)                                                                                |

---

## 4. Tech Stack & Engineering Standards

- **Framework**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) (Strict low border-radius configuration)
- **Package Manager**: `pnpm`
- **Deployment Target**: Vercel
- **Code Quality Hooks**:
  - **Husky + lint-staged**: ESLint & Prettier automated checks on commit.
  - **Gitleaks**: Native Git pre-commit secret detection rule enforcement (`.gitleaks.toml`).
- **Monetization**: Integrated "Buy Me a Coffee" badge in repository `README.md` and workspace footer.

---

## 5. File & Directory Layout

```text
llm-ready/
├── .github/
│   └── workflows/          # CI pipeline for linting, prettier, and gitleaks
├── .husky/                 # Pre-commit hooks configuration
│   ├── pre-commit          # Executing lint-staged and gitleaks protect
├── public/
├── src/
│   ├── app/
│   │   ├── page.tsx        # Step 1: Landing Page & Audit Input
│   │   ├── app/
│   │   │   └── page.tsx    # Step 2: Interactive Workspace
│   │   ├── api/
│   │   │   └── audit/      # Serverless analysis handler
│   │   ├── layout.tsx
│   │   └── globals.css     # Dark zinc theme variables with 4px border-radius
│   ├── components/
│   │   ├── ui/             # Low-radius shadcn/ui components
│   │   ├── landing/        # TerminalHero, SpecChecklist, QuickAuditBar
│   │   └── workspace/      # AuditTable, LlmsTxtEditor, ScraperSimulator
│   ├── lib/
│   │   ├── analyzer.ts     # RFC 9309 parser, llms.txt validator, SNR calculator
│   │   └── utils.ts
│   └── types/              # Audit data interfaces
├── .gitleaks.toml          # Secret detection rule set
├── .prettierrc             # Standard Prettier config
├── eslint.config.mjs       # ESLint config
├── package.json
└── README.md               # Vercel setup, pnpm commands, Buy Me a Coffee button
```
