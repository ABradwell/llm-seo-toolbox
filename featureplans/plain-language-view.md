# Plain-language view

Give non-technical readers, such as an SEO marketer, a version of the audit they can act on. For each failing check they see why it is red without jargon and what to ask a developer for. The view also gives them one copy-paste block of change requests to send. The full technical matrix is one toggle away.

## Why

The audit was built for developers. Labels such as "Single H1", "RFC 9309 §2.2.1" and "SNR" mean nothing to a marketer. Feedback said marketers could see that something was red but not why, and did not know what to ask for.

Guardrails:

- The plain copy explains results. It never changes a status or a score
- Titles and problem sentences carry no jargon. Requests may name files and tags, because a developer reads them
- Every request maps to a real check result. Nothing is invented
- Short sentences, no em dashes

## Shape

| Layer        | Where                                       | What                                                                                                                                         |
| ------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy catalog | `packages/core/src/plain-language.ts`       | One entry per check id, plus a `bot-*` template filled from `AI_CRAWLERS`. Title, problem per status, why, what good looks like, owner, asks |
| Brief        | `packages/core/src/brief.ts`                | `buildPlainBrief(report)` groups issues into must fix and worth improving. `renderChangeRequests` writes the copy-paste markdown             |
| Web          | `src/components/workspace/plain-report.tsx` | The default view of the first tab. `?view=technical` shows the audit matrix                                                                  |
| CLI          | `packages/cli/src/formatters/brief.ts`      | `--format brief`                                                                                                                             |
| Action       | `actions/audit/src/plain.ts`                | `report-style: plain` posts the brief under the gate verdict                                                                                 |

The brief is built from `AuditReport`, so all three surfaces share one path. `AuditReportCheck` now carries `scope` and `sample`, so the brief can say "3 of 8 sampled pages".

## Copy-paste format

Markdown that also reads as plain text, so it pastes into a ticket, an email or a chat message. Each item has a title, the plain problem, the "What we need" bullets, and lines for reach and owner. An optional switch adds the check id, evidence location, finding, recommendation and fix snippet for the developer.

## Coverage

`SITE_CHECK_IDS` and `PAGE_CHECK_IDS` list every id the engine emits. Tests assert that the analyzer emits only listed ids and that the catalog resolves copy for every id in both warn and fail. An unknown id falls back to the technical label and recommendation, so a new check never breaks the view.
