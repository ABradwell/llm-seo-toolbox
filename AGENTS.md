<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Branch and pull request workflow

Never commit directly to `main`. Every change goes through a branch and a pull request:

1. Branch from an up-to-date `main` using a short, descriptive name: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>` or `refactor/<slug>`.
2. Commit the work to that branch. Keep the tree clean, and commit the managed Next.js block above with your changes rather than reverting it.
3. Run the same checks CI runs before pushing: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
4. Push the branch and open a pull request against `main` with `gh pr create --base main --fill`. Use `--title` and `--body` when the default title and body are not descriptive enough, and include a short summary and test plan.
5. Do not merge the pull request yourself unless the user explicitly asks. Report the PR URL in your final response.
