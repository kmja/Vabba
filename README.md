# Föräldrapenning­planeraren

A client-side planning aid that helps two parents work out a good way to split
their Swedish parental-leave days (_föräldrapenning_). It encodes
Försäkringskassan's public ruleset and runs a small optimizer over it.

> **This is a planning aid, not official advice.** It is not Försäkringskassan
> and not a decision. Amounts and rules change — always verify current figures
> against [forsakringskassan.se](https://www.forsakringskassan.se/privatperson/foralder/foraldrapenning)
> before relying on a plan. All calculations run locally in the browser; no
> income data leaves the device.

## What it does (v1)

- **Inputs:** child's birth/due date, number of children in the birth, each
  parent's gross monthly income, and any days already used per tier.
- **Outputs:**
  - days remaining per tier (income-based vs. flat-rate),
  - a suggested split that never forfeits reserved days, with an estimated
    payout — under two objectives you can toggle between: **maximise the total
    benefit** or **split time at home evenly**,
  - typed warnings (reserved-day forfeiture, SGI protection, before-4 / after-4
    timing, dubbeldagar window, income above the SGI cap),
  - a milestone timeline (1 year, 15 months, 4 years, 12 years).

Out of scope for v1: employer top-ups (_föräldralön_), _tillfällig
föräldrapenning_ (vab — a natural v2 module), _graviditetspenning_, and actually
applying for anything.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · hand-rolled shadcn/ui-style
components · Vitest. The app is purely client-side — there is no backend.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm test         # run the Vitest suite
npm run test:watch
npm run typecheck
npm run lint
npm run build    # production build
```

## Architecture

The ruleset and the math are deliberately decoupled from React so they can be
unit-tested in isolation and ported elsewhere.

| File | Responsibility |
| --- | --- |
| `src/lib/rules.ts` | **Source of truth.** Every Försäkringskassan figure as a dated, source-linked constant, plus low-level pure helpers (daily amounts, day budget). No framework imports. |
| `src/lib/dates.ts` | Calendar math for the age-based deadlines. |
| `src/lib/calc.ts` | Day accounting: budget, usage, days remaining per tier, reserved-day risk, deadlines. Owns the shared input types. |
| `src/lib/optimizer.ts` | Allocates remaining days between the parents under each objective; produces payouts and warnings. |
| `src/lib/format.ts` | Swedish-locale display helpers (UI only). |
| `src/components/*` | Presentational output components + the single `"use client"` orchestrator (`planner.tsx`). |

Each logic module has a colocated `*.test.ts`. The optimizer's enumeration scores
candidate splits by payout minus penalties (forfeited / SGI-risk days), exactly
as the brief outlines.

## Updating the figures each year

When Försäkringskassan updates amounts (usually each January with the new
_prisbasbelopp_), the change should be a **one-file edit** to
`src/lib/rules.ts`:

1. Update the constants (`MONEY.prisbasbelopp`, `MONEY.maxSjukpenningPerDay`,
   day counts, etc.).
2. Bump `RULESET_YEAR` and `RULESET_VERIFIED_ON` (this date is shown in the UI so
   users know the ruleset can be stale).
3. Resolve any `TODO(confirm)` comments against the primary source.
4. Run `npm test` — the suite pins several known values and will flag drift.

### Verification status

Core 2026 figures were checked against public sources in June 2026 and are
annotated inline in `rules.ts`. A few edge details (reserved-day tier
composition, the multiple-birth tier split, the exact SGI-protection intensity)
carry `TODO(confirm)` notes and should be verified against Försäkringskassan
before being treated as authoritative.
