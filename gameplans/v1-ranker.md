# LLMReady — Product & Architecture Specification

An open-source, free toolbox for LLM site compatibility, parsing evaluation, and standard generation.

---

## 1. Product Vision & User Experience

Inspired by the two-step user flow of tools like **Coolors.co**, the site separates quick marketing/discovery from the deep interactive workspace.

### **Step 1: Landing Page (`/`)**

- **Hero Section**: High-impact heading with quick-value promise and high-contrast status badges.
- **Primary Scan Input Bar**: A prominent search bar allowing users to enter any domain (e.g., `example.com`) and jump straight into the audit results.
- **One-Click Sample Showcase**: Preset audit targets for popular doc sites (e.g., `Next.js`, `Stripe`, `Python Docs`, `Tailwind CSS`).
- **Educational Feature Matrix**: Clear explanation of LLM crawlers (`Google-Extended`, `ClaudeBot`, `GPTBot`, `PerplexityBot`) and standards like `/llms.txt`.
- **Footer & Open Source Banner**: Embedded **Buy Me a Coffee** widget, GitHub repository star link, and Vercel deployment status.

### **Step 2: Interactive Tool Workspace (`/app` or `/generate`)**

- **Global Header**: Quick domain switcher, real-time score indicator, export controls, and home navigation.
- **Main Navigation Tabs**:
  1. **Audit Dashboard**: Composite 0–100 LLM Readiness Score broken down into pass/warning/fail items across 4 pillars.
  2. **`llms.txt` Interactive Builder**: Form inputs to auto-generate standard-compliant `/llms.txt` and `/llms-full.txt` files with live preview, copy, and download buttons.
  3. **LLM Scraper Vision Simulator**: Comparative side-by-side view showing raw HTML vs. clean Markdown parsed view.

---

## 2. LLM Compatibility Scoring Pillars

| Pillar                                | Analysis Criteria                                                                                             | Purpose                                                                                              |
| :------------------------------------ | :------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------- |
| **1. Discovery & Manifests**          | • `/llms.txt` & `/llms-full.txt` existence<br>• `sitemap.xml` structure & availability                        | Provides AI crawlers a direct, clean index without crawling thousands of unneeded pages.             |
| **2. Crawler Access Rules**           | • `robots.txt` directives for AI user-agents (`Google-Extended`, `ClaudeBot`, `GPTBot`, `Bytespider`)         | Prevents accidental bot blocking while maintaining granular security rules.                          |
| **3. Semantic SNR (Signal-to-Noise)** | • Heading hierarchy (`h1`–`h6`)<br>• Text-to-DOM ratio<br>• SSR vs client-side dynamic rendering              | Ensures scrapers do not waste LLM context window tokens on script tags, ads, and navigation clutter. |
| **4. Structured Machine Interfaces**  | • JSON-LD schema metadata<br>• OpenAPI specification (`/openapi.json`)<br>• `.well-known` discovery endpoints | Enables LLM agents to execute structured actions and extract accurate data schemas.                  |

---

## 3. Directory Structure (Next.js App Router)

```text
llm-ready/
├── .github/
│   └── workflows/          # CI pipeline for linting, format, and gitleaks
├── .husky/                 # Pre-commit hooks
│   ├── pre-commit          # Runs lint-staged & gitleaks
├── public/
│   └── assets/             # Static icons & brand assets
├── src/
│   ├── app/
│   │   ├── page.tsx        # Step 1: Landing Page
│   │   ├── app/
│   │   │   └── page.tsx    # Step 2: Tool Workspace
│   │   ├── api/
│   │   │   └── audit/      # Analysis backend handler
│   │   ├── layout.tsx
│   │   └── globals.css     # Design system & Tailwind theme
│   ├── components/
│   │   ├── ui/             # shadcn/ui primitives
│   │   ├── landing/        # Hero, QuickScan, FeatureGrid, CoffeeBanner
│   │   └── tool/           # AuditScore, Recommendations, LlmsTxtBuilder, VisionSimulator
│   ├── lib/
│   │   ├── analyzer.ts     # Parsing engine (robots.txt, llms.txt, SNR calculation)
│   │   └── utils.ts
│   └── types/              # TypeScript definitions for audit data
├── .gitleaks.toml          # Secret detection rule configuration
├── .prettierrc             # Standard code formatting rules
├── eslint.config.mjs       # ESLint configuration
├── package.json
└── README.md               # Setup docs, Vercel guide, Buy Me a Coffee badge
```

---

## 4. Tech Stack & Engineering Standards

- **Framework**: Next.js (App Router, Server Components, TypeScript)
- **Styling**: Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/)
- **Package Manager**: `pnpm`
- **Deployment Target**: Vercel
- **Code Quality & Security Hooks**:
  - **Husky + lint-staged**: Prettier code formatting & ESLint standard checks on commit.
  - **Gitleaks**: Native git pre-commit hook preventing secret leakage (`gitleaks protect --staged`).
- **Monetization / Community**: Integrated "Buy Me a Coffee" banner in repository `README.md` and app footer.

---

## 5. Implementation Sequence

1. **Repository Setup**: Initializing `package.json`, `pnpm-lock.yaml`, Husky pre-commit rules, ESLint/Prettier configs, and `gitleaks` setup.
2. **Theme Setup**: Integrating custom colors/theme variables into Tailwind/shadcn configuration (`globals.css`).
3. **Step 1 UI**: Building the Landing Page, URL search bar, sample site showcases, and value propositions.
4. **Step 2 UI**: Building the Audit Workspace, `llms.txt` Generator, and LLM Vision Simulator tabs.
5. **Backend Analysis Engine**: Implementing standard checks for `robots.txt`, `/llms.txt`, JSON-LD, and SNR processing in `/api/audit`.
6. **Documentation & Deployment**: Finalizing the `README.md` with Vercel deployment steps and Buy Me a Coffee integration.
