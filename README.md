# Föräldradagar

A client-side planning aid for Swedish parental benefits. It encodes
Försäkringskassan's public rulesets and runs the math for you. Two tools live
behind a shared shell:

- **Föräldrapenning** (`/`) — split the parental-leave days between two parents.
- **Vab – vård av barn** (`/vab`) — track temporary parental benefit (care of a
  sick child) per year.

> **Planning aid, not official advice.** Not Försäkringskassan and not a
> decision. Amounts and rules change — always verify current figures against
> [forsakringskassan.se](https://www.forsakringskassan.se/privatperson/foralder)
> before relying on a plan. All calculations run locally in the browser; no
> personal data leaves the device.

## What it does

**Föräldrapenning planner**

- **Inputs:** child's birth/due date, number of children in the birth, each
  parent's gross monthly income, days already used per tier.
- **Outputs:** days remaining per tier; a suggested split that never forfeits
  reserved days, under two objectives you can toggle (**maximise total benefit**
  vs. **split time at home evenly**), with estimated payout; typed warnings
  (reserved-day forfeiture, SGI protection, before-4 / after-4 timing,
  dubbeldagar window, income above the SGI cap); and a milestone timeline.

**Vab calculator**

- **Inputs:** gross monthly income, number of children, custody, vab days used
  this year.
- **Outputs:** vab days remaining this year (120/child, 240 for a sole-custody
  parent), estimated daily amount and value (note the lower 7.5-PBB ceiling),
  and the key rules (age 8 months–12 years, 12–16 needs a certificate,
  certificate from day 8, the 2026 30-day application deadline, transfers).

Out of scope: employer top-ups (_föräldralön_), _graviditetspenning_, and
actually applying for anything.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · hand-rolled
shadcn/ui-style components · Vitest. Purely client-side; no backend.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm test         # Vitest suite
npm run test:watch
npm run typecheck
npm run lint
npm run build    # production build
```

In Claude Code on the web, `.claude/hooks/session-start.sh` runs `npm install`
automatically on session start so tests, linting and the build work right away.

## Architecture

The rulesets and the math are decoupled from React so they can be unit-tested in
isolation and ported elsewhere.

| File | Responsibility |
| --- | --- |
| `src/lib/rules.ts` | **Föräldrapenning source of truth** — dated, source-linked constants + pure helpers. No framework imports. |
| `src/lib/vab.ts` | **Vab source of truth** — a separate ruleset (deliberately not entangled with the FP optimizer) + a small calculator. |
| `src/lib/dates.ts` | Calendar math for the age-based deadlines. |
| `src/lib/calc.ts` | FP day accounting: budget, usage, remaining per tier, reserved-day risk, deadlines. |
| `src/lib/optimizer.ts` | Splits FP days between the parents under each objective; payouts + warnings. |
| `src/lib/format.ts` | Swedish-locale display helpers. |
| `src/components/` | Presentational components + two `"use client"` orchestrators (`planner.tsx`, `vab-calculator.tsx`) and the shared nav (`site-header.tsx`). |

Each logic module has a colocated `*.test.ts`; the two client orchestrators have
JSDOM render tests. 65 tests in total.

## Updating the figures each year

When Försäkringskassan updates amounts (usually each January with the new
_prisbasbelopp_), it should be a **one-file edit** — `src/lib/rules.ts` for
föräldrapenning, `src/lib/vab.ts` for vab:

1. Update the constants (prisbasbelopp, max daily amounts, day counts, caps).
2. Bump `RULESET_YEAR` / `VAB_RULESET_YEAR` and the `*_VERIFIED_ON` date (shown
   in the UI so users know the ruleset can be stale).
3. Resolve any `TODO(confirm)` comments against the primary source.
4. Run `npm test` — the suite pins several known values and will flag drift.

### Verification status

Core 2026 figures were checked against public sources in June 2026 and are
annotated inline. Resolved: reserved-day tier, multiple-birth split (90/90 per
extra child), grundnivå (250 kr), SGI-protection intensity, and the vab figures
(120/240 days, 7.5-PBB ceiling, age limits). One `TODO(confirm)` remains: the
exact vab transfer caps in `vab.ts` (the primary FK page was inaccessible to the
fetcher during research).
