<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git identity and credentials

This is a personal repository owned by `ABradwell`. Every commit, push and pull request must use the ABradwell identity, never a work account such as `aiden-zally` or `aiden@zally.com`.

- Commit as `Aiden Stevenson Bradwell <Aidenbradwell@gmail.com>`. The repository's local `.git/config` already sets this. Confirm with `git config user.email` before committing, and do not override it with `-c user.email=...`, `--author` or environment variables.
- Push and open pull requests as the `ABradwell` GitHub account. Git authenticates through `gh`, and the active `gh` account on this machine may be a work account. Do not run `gh auth switch`. Override the token for each command instead:
  ```bash
  GH_TOKEN="$(gh auth token --hostname github.com --user ABradwell)" git push -u origin <branch>
  GH_TOKEN="$(gh auth token --hostname github.com --user ABradwell)" gh pr create --base main --fill
  ```
  Use the same prefix for every `gh` command that writes to GitHub, such as `gh pr edit` and `gh pr comment`.
- If the ABradwell credentials are missing or a push is rejected, stop and ask the user. Do not fall back to another account.

## Branch and pull request workflow

Never commit directly to `main`. Every change goes through a branch and a pull request:

1. Branch from an up-to-date `main` using a short, descriptive name: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>` or `refactor/<slug>`.
2. Commit the work to that branch. Keep the tree clean, and commit the managed Next.js block above with your changes rather than reverting it.
3. Run the same checks CI runs before pushing: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
4. Push the branch and open a pull request against `main` with `gh pr create --base main --fill`. Use `--title` and `--body` when the default title and body are not descriptive enough, and include a short summary and test plan.
5. If the work changes anything users see, attach screenshots to the pull request before asking for review. See [Screenshots for visual changes](#screenshots-for-visual-changes).
6. Do not merge the pull request yourself unless the user explicitly asks. Give the user the PR link as soon as the pull request is created, and repeat it in your final response.

## Screenshots for visual changes

Every agent must attach screenshots to the pull request for any change that alters what users see. This includes UI, layout, styling, colour, typography, spacing, responsive behaviour, images, icons, animations and interactive states. Purely internal changes do not need screenshots.

- Capture the affected routes and states at desktop (1440×900) and mobile (390×844) widths. When changing an existing interface, include both the before and after views.
- Save captures to a temporary directory outside the repository, such as `$TMPDIR/llm-ready-screenshots/`, so throwaway images are not committed.
- Add a `## Screenshots` heading at the end of the pull request body, then attach the images when creating the pull request. `gh` uploads them and appends them beneath the heading (pass `--body` or `--body-file` when `--fill` does not include one):
  ```bash
  gh pr create --base main --fill \
    --attach "$TMPDIR/llm-ready-screenshots/home-desktop-after.png#Home page, desktop, after" \
    --attach "$TMPDIR/llm-ready-screenshots/home-desktop-before.png#Home page, desktop, before" \
    --attach "$TMPDIR/llm-ready-screenshots/home-mobile-after.png#Home page, mobile, after"
  ```
- If the pull request is already open, attach the images with `gh pr edit <number> --attach <file>#<alt text>` or `gh pr comment <number> --attach <file>#<alt text>`.
- Label each image with the route, viewport and before/after state. Verify the uploaded images render correctly in the pull request before asking for review.
- If a visual change cannot be captured in a screenshot, explain why in the pull request.
