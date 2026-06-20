# Deploying Slayer Terminal

This app is **one app**: an Express server (`server.ts` → `dist/server.cjs`) that
serves both the API and the built React frontend. It needs **Node** + **Postgres**.
`render.yaml` provisions both.

---

## 1. Deploy to Render (app + database)

1. Make sure the repo is on GitHub (it is).
2. **Render Dashboard → New → Blueprint** → select this repo. Render reads `render.yaml`
   and creates a **web service** + a **Postgres database**, already wired together.
3. When prompted, fill in the `sync: false` values (see step 2 below). You can leave
   the optional ones blank for now.
4. Click **Apply / Deploy**. First build runs `npm install && npm run build`; the app
   starts with `npm start`. The **database schema creates itself on first boot**
   (no manual migration needed).
5. You'll get a URL like `https://slayer-terminal.onrender.com`. Open it — the app
   should load and you should be able to sign up / log in (that proves Postgres works).

> Plans default to **free** ($0). Free web services sleep after ~15 min idle and free
> Postgres expires after 90 days — in `render.yaml` change `plan: free` → `starter`
> (web) / `basic` (db) for always-on production.

## 2. Set the secret environment variables (Render → service → Environment)

Required to actually charge money:
- `STRIPE_SECRET_KEY` — `sk_test_…` (test) or `sk_live_…` (live)
- `STRIPE_WEBHOOK_SECRET` — from step 4 below (`whsec_…`)
- `VITE_STRIPE_PUBLISHABLE_KEY` — `pk_test_…` / `pk_live_…`

Recommended:
- `APP_URL` — set to your final URL (e.g. `https://slayerterminal.com`) so Stripe
  redirects land back on your site
- `ADMIN_EMAILS` — your email(s), comma-separated, for admin access
- `GEMINI_API_KEY` — enables AI commentary (optional; degrades gracefully)
- `POLYGON_API_KEY` and/or `TRADIER_API_KEY` + `TRADIER_ENV` — **live market data**
  (without these the engine runs on simulated data)

`SQL_*` and `COOKIE_SECRET` are wired/generated automatically by `render.yaml` — leave them.

> 🔒 Never put secret keys in the repo or in chat. They live only in Render's env settings.

## 3. Point your domain (slayerterminal.com)

Your DNS is at Squarespace (Google Domains migrated there). In **Render → service →
Settings → Custom Domains**, add `slayerterminal.com` and `www.slayerterminal.com`.
Render shows the exact records. In Squarespace DNS:
- Replace the apex `A` record(s) with the value Render gives (or a CNAME/ALIAS if offered)
- Point the `www` CNAME at the Render hostname
- **Leave the `MX` and Google `TXT` records alone** so `info@slayerterminal.com` keeps working

Then set `APP_URL=https://slayerterminal.com` and redeploy. Render auto-issues HTTPS.

## 4. Set up the Stripe webhook (so upgrades apply)

In **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
- URL: `https://slayerterminal.com/api/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` on Render.

Test in Stripe **test mode** first: do a test purchase, confirm the tier upgrades
and persists (the webhook sets `access_tier` and saves it).

## 5. Go-live checklist
- [ ] App loads on the Render URL, login works (Postgres OK)
- [ ] Custom domain resolves + HTTPS padlock, `APP_URL` updated
- [ ] `info@` email still works (MX untouched)
- [ ] Stripe test purchase upgrades a tier end-to-end
- [ ] (When ready) flip Stripe to **live** keys
- [ ] Market-data key set (scores on real data, not simulated)
- [ ] Legal pages published (see `legal/`) and linked in the footer
- [ ] Bump plans off `free` for always-on
