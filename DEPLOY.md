# DEPLOY — the one remaining step (repo creation)

**State on 23 Nov 2026:** the build is complete and verified locally
(26/26 tests, full browser QA, 0 console errors). Deployment is blocked on
exactly one step that cannot be done from the agent VM:

- GitHub connector `create_repository` → **403 "Resource not accessible by
  integration"** (the connector can push to existing repos, it cannot
  create them).
- `gh` CLI on the VM is not logged in; no Netlify/Vercel/Cloudflare
  credentials exist on the VM.

## The step (about a minute, in the user's signed-in browser)
1. Go to **github.com/new** and create a **public** repo named exactly
   **`georaksha`**. Do **not** add a README or .gitignore (the local repo
   already has both history and files).

## Immediately after (agent can do all of this)
2. Push the prepared local repo:
   `git -C ~/workspace/hackathons/configure-2026/georaksha push` —
   the local repo is committed and its `origin` will be set to
   `https://github.com/MSAbhishek22/georaksha.git` once the repo exists
   (or push via the GitHub connector's push-files snapshot).
3. Enable Pages: repo **Settings → Pages → Source: Deploy from a branch →
   `main` / `/ (root)` → Save**.
4. Live URL becomes **https://msabhishek22.github.io/georaksha/** —
   verify as a signed-out stranger (stream runs, zone draw works, alert
   fires), then fill the Live URL / repo / commit into README.md.

Alternative if Pages is unwanted: drag the project folder (or
`georaksha-site.zip` if present) onto Netlify Drop under the user's
GitHub-linked Netlify account; record the issued URL in README.md instead.
