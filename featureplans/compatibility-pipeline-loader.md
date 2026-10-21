# Compatibility pipeline loader

Replace the workspace skeleton with a loading screen that walks the visitor through the three phases of an audit: collecting the site, classifying it, and analyzing its LLM compatibility.

Interactive options: https://claude.ai/artifact/UgtYG8kCzGXn4uTepe61rD

## Why

The current loading state is a pulsing skeleton and a single line of text ([workspace.tsx](../src/components/workspace/workspace.tsx), `WorkspaceSkeleton`). It tells the visitor nothing about the work being done on their behalf.

Research on the labor illusion (Buell and Norton, 2011) found that people value a service more when they can see the effort behind it, even when they wait slightly longer. The effect depends on the steps being credible. A loader that names real work earns trust. One that invents work, or stalls for the sake of it, loses it.

Guardrails that follow from this:

- Every step shown maps to work `analyzeSite` actually performs
- The live sequence runs about seven seconds from mount so each step stays readable; cached results stay fast
- Step results only appear once real data exists
- No invented failures, retries or "optimizing" steps

## Pipeline

Three phases, thirteen steps. The right-hand column is the code each step represents.

### Collecting site

| Step                                           | Source                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Validating URL                                 | `assertSafeUrl` in `src/lib/security.ts`                                              |
| Fetching homepage HTML                         | `fetchText(requested)` in `analyzeSite`                                               |
| Requesting robots.txt, llms.txt, llms-full.txt | the `Promise.all` discovery fetch, which also covers `openapi.json` and `.well-known` |
| Reading sitemap.xml                            | `parseSitemap` in `src/lib/sitemap.ts`                                                |

### Classifying site

| Step                        | Source                                    |
| --------------------------- | ----------------------------------------- |
| Inspecting JSON-LD types    | `classifySite` JSON-LD `@type` signals    |
| Scanning routes and DOM     | hostname, path and DOM heuristics         |
| Checking meta and OpenGraph | `og:type`, title and description signals  |
| Assigning site profile      | the winning `SiteType` and its confidence |

### Analyzing LLM compatibility

| Step                          | Source                                                 |
| ----------------------------- | ------------------------------------------------------ |
| Discovery and manifests       | pillar 1, `validateLlmsTxt` and sitemap linkage        |
| Crawler access (RFC 9309)     | pillar 2, `crawlerAccess`, meta robots, `X-Robots-Tag` |
| Static parseability and SNR   | pillar 3, `buildContentModel`                          |
| Structured machine interfaces | pillar 4, JSON-LD and conditional endpoints            |
| Scoring                       | `scoreAudit` and `gradeFor`                            |

Each phase also carries a one-line summary shown once it completes, such as `SaaS · 82%` for classification.

## Timing model

The audit is a single request today, so the first version choreographs the sequence on the client.

- Nominal pace is 7 seconds: collecting 2.4s, classifying 1.8s, analyzing 2.8s
- Live audits play at 1x before and after the response, so a fast API still shows every step
- If the response has not arrived by the last quarter of the scoring step, the sequence holds there with a "waiting for response" note and the elapsed time
- Cached results (`audit.meta.cached`) play at 4x, about 1.75 seconds in total
- Steps completed before the response show `done`. Their findings backfill from the response with a short highlight when it lands

| Response arrives | Sequence length       |
| ---------------- | --------------------- |
| 0.9s             | about 7.0s            |
| 2.8s             | about 7.0s            |
| 7.0s             | about 7.1s, with hold |
| cached           | about 1.75s           |

### Errors

An `AuditError` stops the sequence at the step that owns its code, marks it with the `fail` colour, and shows the existing `ErrorState` message and hint beneath the loader.

| Error code                                      | Stops at               |
| ----------------------------------------------- | ---------------------- |
| `missing_url`, `invalid_url`, `blocked_url`     | Validating URL         |
| `fetch_failed`, `http_error`, `not_html`        | Fetching homepage HTML |
| `rate_limited`, `internal_error`, anything else | Before the first step  |

## Options

All four are live in the artifact and share the timing model above.

- **A. Ledger.** Three stacked phases. The active phase expands to show its steps, finished phases fold into a summary line. Fits the skeleton's footprint and leaves a readable trail of findings
- **B. Crawler log.** A dark terminal stream with timestamps, echoing `LiveTerminal` on the landing page. Feels most mechanical, but it is dense on mobile and heavy against the parchment workspace
- **C. Pipeline rail.** The landing page's `PipelineDiagram` brought to life, with the active phase's steps as filling chips below. Strong continuity, but only one phase's detail is visible
- **D. Signal ring.** One segmented ring with an arc per phase and a notch per step, resolving into the score. The strongest single moment, but a percentage implies precision the client clock does not have

## Recommendation

Ship option A as the default workspace loading state. Borrow the rail from option C as a compact desktop header if the ledger alone feels too quiet. Keep option B in reserve as a possible "verbose" toggle for developers.

## Implementation

### Files

Status: shipped as option A.

- `src/lib/pipeline-steps.ts` holds the phase and step definitions, nominal durations, a `result(audit)` mapper per step, a `summary(audit)` per phase, and `stepForError(code)`
- `src/lib/pipeline-timeline.ts` is a pure reducer: `advance(timeline, deltaMs, { responded, cached, failedStepId })` and `snapshot(timeline)` return step states, phase fractions and the hold flag. It has no DOM or timers
- `src/lib/use-pipeline-timeline.ts` drives the reducer with `requestAnimationFrame`, caps long frames so a background tab does not skip the sequence, and calls `onComplete` once
- `src/components/workspace/pipeline-loader.tsx` renders the ledger from the snapshot

### Workspace changes

- `PipelineLoader` replaces `WorkspaceSkeleton` while an audit runs. The skeleton remains as the route's Suspense fallback
- A `revealedUrl` state holds the URL whose report the loader has handed off to. The report and the header score badge only render once the loader finishes, so the score is not shown early
- Refreshes and site-type overrides on a revealed URL keep the report on screen with the existing "refreshing" indicator instead of replaying the loader
- Errors with a mapped step freeze the loader on that step and show `ErrorState` beneath it. Errors without a step, such as `rate_limited`, show `ErrorState` alone

### Accessibility

- The ledger is a `role="progressbar"` with `aria-valuenow`
- An `aria-live="polite"` region announces phase changes only, not every step
- Under `prefers-reduced-motion`, spinners and collapse transitions are removed. Steps still tick through so progress stays visible

### Phase 2: real progress

Once the client version ships, stream progress from the server so each step ticks on a real event.

- Add `?stream=1` to `/api/audit`, returning NDJSON events such as `{ "step": "fetch-home", "result": "200 · 412 KB" }` followed by the final `AuditResult`
- `analyzeSite` accepts an optional `onProgress` callback, emitted at the boundaries listed in the pipeline tables above
- The loader consumes real events when available and falls back to the choreographed timeline otherwise. The visuals do not change

## Testing

- Vitest coverage for `pipeline-timeline.ts`: fast, typical, slow and cached responses, the hold, and error stops
- Vitest coverage for `resultFor` against fixture audits
- Screenshots of the loader mid-phase and the hold state at 1440×900 and 390×844, attached to the pull request per `AGENTS.md`

## Open questions

- Should the loader stay visible for a moment after `done`, or hand off to the report immediately?
- Should option D's ring replace `ScoreRing` entirely, so the loader and the report share one element?
- Should the live sequence stay fixed at seven seconds, or scale with the audit's measured duration once the API streams real progress?
