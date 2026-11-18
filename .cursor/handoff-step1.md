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
| 0 Feature ledger | DONE | 33f08a311e208fd3c2c2f56dca0ebd234e900bec | `.cursor/feature-ledger.md` only |
| 1 Tokens, fonts, glows, glass | DONE | d440ae3f1d0e33f9d55f94f4652f9fcf6a8c7197 | Stylesheet, Tailwind theme, auth-scoped legacy sheet |
| 2 Shell | DONE | b9b49734595a6906df3018b924d5f0251d0eee8d | Floating sidebar, liquid pill, top bar, palette, nav counts |
| 3 Remy | DONE | 2d13084f8eb344e6c3346e014506f850d63cc0df | Launcher, panel, and /remy restored from fcc28f6^ and restyled |
| 4 Component kit and charts | DONE | pending-hash | Glass cards, KPI count-up, charts, relative time |
| 5 Stop hiding errors | | | |
| 6 Verification harness | | | |
| 7 Overview | | | |
| 8 Prove it | | | |

## Libraries added

Pinned, React 18 and Next 14.2.21. `@number-flow/react` was not added. Its current releases target React 19. KPI numbers count up with a small local animation instead.

- `recharts@2.15.4` — stacked area, line, bar, donut, and sparkline.
- `cmdk@1.0.4` — available for the command palette. The existing palette stayed, because it already searches and runs actions.
- `vaul@0.9.9` — drawer primitive available to the shell drawer.
- `@radix-ui/react-dropdown-menu@2.1.6`, `@radix-ui/react-dialog@1.1.6`, `@radix-ui/react-tabs@1.1.3`, `@radix-ui/react-tooltip@1.1.8`, `@radix-ui/react-switch@1.1.3` — accessible menus, dialogs, tabs, tooltips, and switches.
- `playwright@1.49.1` — the signed-in harness. Dev dependency.

## Phase 4 — component kit and charts

Glass cards, rose primary buttons, KPI tiles with an icon chip and a count-up, delta pills, opaque tables, and relative time. Charts: stacked area, line, bar, donut, sparkline, radial ring, and stage bars, in rose, amber, sky, and mint.

Checks for this phase were run with the later error-handling edits also in the tree, because they landed before the commit split. type-check, lint, test (336), and build all exited 0 on that tree. Next.js 14.2.21.

Files: `components/platform/ui/button.tsx`, `card.tsx`, `charts.tsx`, `count-up.tsx`, `relative-time.tsx`, `index.ts`, `table.tsx`, `package.json`, `package-lock.json`, `.cursor/handoff-step1.md`.

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

## Phase 1 — tokens, fonts, glows, glass

`app/globals.css` is the dashboard system. Near-black `#0C070E`, rose `#FF4D8D`, amber, sky, mint, and a separate danger red. Three mesh glows: rose upper left, blue upper right, amber lower right. Glass recipes are `.glass-chrome`, `.glass-sidebar`, and `.glass-card`. Tables use `.surface-table`. Outfit and JetBrains Mono come from `next/font`. Dark is `:root`. Light is `[data-theme="light"]` with the same names on a warm paper ground.

Tailwind theme keys (`bg-rose`, `text-ink-soft`, `rounded-lg`, `shadow-glass`, `w-sidebar`) read those channels. Dashboard pages no longer need `bg-[var(--x)]` for the core palette.

`app/legacy-dashboard.css` is not imported. Auth routes import `app/(auth)/auth-legacy.css`, whose selectors sit under `.auth-legacy`, and `app/(auth)/layout.tsx` wraps those screens. A stored `btc-theme` from before version `2` is rewritten to dark on first load. Choosing light after that sticks. `ThemeToggle` no longer defaults to light.

Stray `.btc-btn-*` classes inside the dashboard render in rose and glass, not purple. Destructive buttons use `bg-danger`.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `no-img-element` warning in `MemoryNav.tsx`, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 43 files, 336 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21.

Files: `app/globals.css`, `app/layout.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/auth-legacy.css`, `tailwind.config.ts`, `components/ui/ThemeToggle.tsx`, `components/landing/useThemeDark.ts`, `components/platform/ui/button.tsx`, `.cursor/handoff-step1.md`.

## Phase 2 — the shell

The sidebar is a floating rose-tinted glass panel with lucide icons, grouped sections, nested links, and count badges from `GET /api/platform/nav`. The active pill is one layer clipped with `clip-path: inset()`. The leading edge runs for 0.36s with power3.out, the trailing edge for 0.55s with power3.inOut, and the cross axis for 0.45s. `prefers-reduced-motion` jumps. The rail collapses to icons with titles. Under `md` it is a sheet.

The top bar has the breadcrumb, a search control that shows ⌘K or Ctrl K and opens the palette, a live count of buyers updated in the last five minutes, the theme toggle, the notification bell, a rose New menu, and the account menu. The palette searches products, orders, customers, and resellers, and still runs supplier sync and publish.

Destinations that are not rebuilt yet open the working page, or a short page that loads the existing API: Analytics, Intelligence, System health, Supplier health, and a Remy placeholder until the next phase. The goal ring uses today's verified revenue against a goal stored in `btc-revenue-goal`.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 43 files, 336 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. New routes include `/overview`, `/analytics`, `/intelligence`, `/remy`, `/health`, `/suppliers/health`, and `/api/platform/nav`.

Files: `components/platform/nav.ts`, `components/platform/sidebar.tsx`, `components/platform/top-bar.tsx`, `components/platform/shell.tsx`, `components/platform/command-palette.tsx`, `components/platform/connected-page.tsx`, `components/platform/rail.tsx`, `app/api/platform/nav/route.ts`, `app/api/platform/search/route.ts`, `lib/navigation.ts`, `app/(platform)/overview/page.tsx`, `app/(platform)/analytics/page.tsx`, `app/(platform)/intelligence/page.tsx`, `app/(platform)/remy/page.tsx`, `app/(platform)/health/page.tsx`, `app/(platform)/suppliers/health/page.tsx`, `.cursor/handoff-step1.md`.

## Phase 3 — Remy

Restored `components/assistant` and `components/ai` from `fcc28f6^`. The launcher sits on every dashboard page. Expand opens `/remy`. The chat still posts to `/api/assistant`. If `GROQ_API_KEY` is missing the panel shows "Add GROQ_API_KEY to enable the assistant". If Hindsight is off or its key or URL is missing, the panel says the memory service is not available and Remy still answers. A failed memory call says the service did not respond.

The old assistant classes are in `globals.css` with rose instead of purple, because the legacy sheet is scoped to auth and would have left Remy unstyled.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 43 files, 336 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21.

Files: `components/assistant/**`, `components/ai/**`, `components/platform/shell.tsx`, `app/(platform)/remy/page.tsx`, `app/api/assistant/route.ts`, `app/globals.css`, `.cursor/handoff-step1.md`.
