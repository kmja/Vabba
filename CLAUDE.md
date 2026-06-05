@AGENTS.md

## Git workflow

- Push changes directly to `main` — the default/production branch. Do not create
  feature branches or pull requests unless explicitly asked. (There is no
  `master` branch; `main` is it.)
- `main` is what Cloudflare Pages builds, so every push deploys to production.
  Run typecheck, lint, tests and `npm run build`, and make sure they pass,
  before pushing.
