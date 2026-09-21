# Phase 0 Exit Gate Checklist

- [x] `npm run build` passes with zero TypeScript errors
- [x] `npm run test` — all money and token unit tests pass
- [x] `npm run lint` — zero lint errors
- [x] `GET /api/health` returns `{ status: "ok" }` in development
- [x] Migration file is valid SQL (no syntax errors)
- [x] `.env.local` was preserved (not overwritten); Binance/Telegram/admin vars use PLACEHOLDER_ prefixes; `.gitignore` excludes it
- [x] `.env.example` committed with no real values
- [x] `BINANCE_PAY_API_KEY=PLACEHOLDER_*` → sandbox client activates automatically
- [x] `BSC_RPC_URL` placeholder → sandbox BscClient activates automatically
- [x] `docs/` folder has architecture.md, decisions.md, phase-checklist.md
- [x] No secret values anywhere in source code or committed files
- [x] `.gitignore` covers `.env.local`, `.env*.local`, `node_modules`, `.next`
