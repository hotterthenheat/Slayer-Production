# Slayer Terminal — Pre-launch landing page

A single, self-contained static "coming soon" page (`index.html`) for
**slayerterminal.com**. No build step, no backend. It runs while the full
app is still in development, and collects early-access emails via a waitlist.

## What it is
- One file: `index.html` (inline CSS + JS, Google Fonts via CDN).
- Waitlist form is pre-wired for **Netlify Forms** — `data-netlify="true"`,
  a hidden `form-name="waitlist"`, and a `bot-field` honeypot. Submissions
  are captured with zero backend.

## Deploy (two ways)

### Fastest — drag & drop (no git)
1. Put `index.html` in a folder on your computer.
2. Go to https://app.netlify.com/drop and drag the folder in.
3. You get a live URL instantly. Add your domain under
   **Site configuration → Domain management**.

### Recommended — connect this repo (auto-updates on push)
1. Netlify → **Add new site → Import an existing project** → pick this repo.
2. Netlify reads `/netlify.toml` automatically: publish dir = `landing`,
   no build. Deploy.
3. Add **slayerterminal.com** under Domain management and follow the DNS
   records Netlify shows you.

## Custom domain + email (slayerterminal.com)
- Point the domain at Netlify using the records Netlify gives you
  (an `A`/`ALIAS` for the apex + a `CNAME` for `www`), set in your
  Squarespace/Google domain DNS.
- **Leave the `MX` records alone** so `info@slayerterminal.com` keeps working.

## Waitlist submissions
- Appear in **Netlify dashboard → Forms → waitlist**.
- Turn on a notification to `info@slayerterminal.com` so each signup emails you.
- Free tier: 100 submissions/month.

## When the real app is ready
Deploy the app separately (e.g. Render) and repoint `slayerterminal.com`
DNS at it. This landing page can be retired or moved to a subdomain.
