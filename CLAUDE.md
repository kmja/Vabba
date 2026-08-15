@AGENTS.md

## Git workflow

- Push changes directly to `main` — the default/production branch. Do not create
  feature branches or pull requests unless explicitly asked. (There is no
  `master` branch; `main` is it.)
- `main` is what Cloudflare Pages builds, so every push deploys to production.
  Run typecheck, lint, tests and `npm run build`, and make sure they pass,
  before pushing.

## Versioning

- The site header shows the version from `package.json` — the single source
  of truth.
- Bump it on every push (patch for fixes/tweaks, minor for features), and
  state the new version number in chat when reporting the push.
