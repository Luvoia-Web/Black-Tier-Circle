# Black Tier Circle — dashboard rebuild, step 1

## Skills

Listed before any UI was written.

Project `.cursor/skills` (7):

- `brand` — loaded. Voice and colour consistency. The mockup palette wins over a generated palette.
- `banner-design` — loaded. Not used. This step is a product UI, not a banner.
- `design` — loaded. Routes token and UI work to `design-system` and `ui-styling`.
- `design-system` — loaded. Three-layer tokens (primitive, semantic, component) and Tailwind theme keys.
- `slides` — loaded. Chart guidance is for pitch decks. Product charts follow the mockups and the chart search below.
- `ui-styling` — loaded. Tailwind theme values, accessible menus, focus, dark mode.
- `ui-ux-pro-max` — loaded. Searches were run before Phase 1.

`~/.cursor/skills` does not exist. Nothing loaded from there.

### What the searches returned, and what this step uses

`ui-ux-pro-max` design-system search for “commerce operations dashboard glass dark” (density 8, motion 6) recommended Liquid Glass, a light stone background, gold `#A16207`, and Cormorant / Montserrat. That palette is not used. The five screenshots in the workspace `.cursor/design-reference/` are the source of truth: near-black with rose, amber, and blue glows, hot rose for the primary action, Outfit for the UI, JetBrains Mono for ids.

`btc-mockups-source.mjs` and the `BTC-*@2x.png` files are not in that folder. The five pasted screenshots are the references that were studied: Overview, Products, Orders, Resellers, Bot Studio.

Glassmorphism search: blur, a 1px light border, translucent fill, reduced motion, 4.5:1 text. Used.

Chart search: streaming area for live data, a compact target mark for the goal. No stacked-area row came back. The Overview chart is still the stacked area from the Overview screenshot.

GSAP search for “liquid pill clip path navigation” and a retry for “navigation indicator” both returned no rows. The pill uses the timings in the task: leading edge 0.36s power3.out, trailing edge 0.55s power3.inOut, cross axis 0.45s. Reduced motion jumps.

## Rules

Do not push. Do not apply SQL. Do not edit migration 0022. Migrations through 0032 stay as they are. A new migration would be 0033, printed, not applied. No Co-authored-by line. Next.js stays 14.2.21. React stays 18. Tests against `.env.local` are read-only.

## Phase status

| Phase | Status | Commit | Notes |
| --- | --- | --- | --- |
| 0 Feature ledger | DONE | pending-hash | `.cursor/feature-ledger.md` only |
| 1 Tokens, fonts, glows, glass | | | |
| 2 Shell | | | |
| 3 Remy | | | |
| 4 Component kit and charts | | | |
| 5 Stop hiding errors | | | |
| 6 Verification harness | | | |
| 7 Overview | | | |
| 8 Prove it | | | |

## Libraries added

None yet.

## Phase 0 — feature ledger

Wrote `.cursor/feature-ledger.md`.

- 50 dashboard pages at `77d75c6` and at `fcc28f6^`, with the action and the API each one called.
- Every component folder that existed at `fcc28f6^`.
- Every feature the rebuild added, mapped to the new sidebar and to step 1, 2, 3, or 4.
- API check: all 101 `API_ROUTES` templates still have a `route.ts`. None flagged missing.

Checks, working tree, unrelated dirty files left out of the commit (`components/landing/MemoryNav.tsx`, other handoff notes, `docs/codebase-audit.md`):

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. One existing warning, `@next/next/no-img-element` in `components/landing/MemoryNav.tsx:43`. That file is not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 43 files, 336 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21.
