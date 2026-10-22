# @llm-seo-toolbox/cli

Audit a website's AI discovery surface from the command line.

```bash
pnpm --filter @llm-seo-toolbox/cli build
node packages/cli/dist/index.js example.com
```

Or from the repository root:

```bash
pnpm cli example.com --min-score 75 --min-grade B
```

The CLI shares the same engine as the Next.js workspace and the GitHub Action:
site classification, `/llms.txt` validation, RFC 9309 crawler access checks,
static HTML signal-to-noise analysis and schema.org interface checks.

## Formats

- `table` — human-readable summary with the four pillar scores
- `json` — full machine-readable report for scripts and CI
- `markdown` — a report suitable for a pull request comment or a file
- `summary` — a compact digest for CI logs

## Exit codes

- `0` — audit completed and met the thresholds
- `1` — audit completed but scored below a threshold
- `2` — the audit could not run

See the root [README](../../README.md#cli) for the full flag list and config file
reference.
