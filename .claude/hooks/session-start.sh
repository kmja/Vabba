#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
# Installs Node dependencies so Vitest, ESLint and the Next.js build work
# immediately in a fresh remote container.

# Only run in remote (web) sessions — local developers manage their own deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Claude Code sets CLAUDE_PROJECT_DIR for hooks; fall back to the repo root
# relative to this script (.claude/hooks/ -> repo root) if it's ever missing,
# so `set -u` can't crash us.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$PROJECT_DIR"

# `npm install` (not `npm ci`) so the cached container layer is reused on
# resume, and so it stays idempotent (safe to run repeatedly). Send install
# output to stderr to keep the session context clean.
npm install >&2

echo "Dependencies installed (npm). Vitest + ESLint ready."
