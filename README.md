# Slayer Terminal

An institutional-grade options intelligence terminal. SkysVision finds the setup;
the Pinpoint quant engine reads dealer flow (GEX/DEX/VEX, gamma flip, walls),
volatility surface, and regime — all computed locally with **no external AI/LLM
dependency**. It runs fully on high-fidelity simulated data out of the box and
upgrades to live market data when you add provider keys.

This is **one app**: an Express server (`server.ts` → `dist/server.cjs`) that
serves both the API and the built React frontend. It needs **Node** and (for
auth/billing persistence) **Postgres**. See `DEPLOY.md` for the full deploy guide.

## Run locally

**Prerequisites:** Node.js 22+

```bash
npm install
npm run dev      # tsx server.ts — API + Vite dev frontend on http://localhost:3000
```

No keys are required to run: the engine streams realistic synthetic market data
and the Quant Co-Pilot generates its analysis from the live engine. Add keys to
go live (see `.env.example`):

- `POLYGON_API_KEY` / `TRADIER_API_KEY` (+ `TRADIER_ENV`) — live market data
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `VITE_STRIPE_PUBLISHABLE_KEY` — billing
- `SQL_*` + `COOKIE_SECRET` — Postgres persistence + signed sessions

## Scripts

- `npm run dev` — run the server (API + frontend) in development
- `npm run build` — build the frontend (Vite) and bundle the server (esbuild)
- `npm start` — run the production bundle (`dist/server.cjs`)
- `npm run lint` — TypeScript typecheck (`tsc --noEmit`)
- `npm test` — run the quant + SkyScore test suites
