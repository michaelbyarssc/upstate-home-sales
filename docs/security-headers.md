# HTTP security headers

Both apps send a full set of security headers, configured in `apps/public/next.config.mjs` and `apps/admin/next.config.mjs` (the `securityHeaders` array + `csp` string in each). Added 2026-07 in response to an external security audit of upstatehomecenter.com whose only actionable findings were missing headers (everything substantive — secrets, auth, RLS, dependencies, CORS, injection — passed).

## ⚠ The one ongoing rule

**Adding any new third-party script, pixel, font, embed, or API the *browser* talks to requires a matching allowlist entry in that app's CSP** in `next.config.mjs`, or the resource will be silently blocked in production. Server-side integrations (Resend, SignWell API calls, Twilio, Regrid…) are NOT affected — CSP only governs what the browser loads.

Typical example: the dealer asks for a new marketing tag (TikTok pixel, Google Ads, Hotjar…). GTM can't bypass this — a tag added inside GTM still loads from a new origin and will be blocked until `script-src`/`connect-src`/`img-src` allow it.

## Headers sent (both apps)

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | per-app, see below | Blocks unapproved scripts/frames/exfiltration |
| `X-Frame-Options` | `SAMEORIGIN` (public) / `DENY` (admin) | Clickjacking. Public must be SAMEORIGIN — see SignWell note |
| `X-Content-Type-Options` | `nosniff` | Stops MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Neither app uses these. Deliberately does NOT restrict `fullscreen`/`xr-spatial-tracking` (Matterport iframes delegate them) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Overrides Vercel's default to cover subdomains. **No `preload`** — one-way door, don't add it |
| `X-Powered-By` | removed (`poweredByHeader: false`) | Framework disclosure |

## CSP allowlist — why each origin is there

Shared by both apps:
- **Supabase** (`https://<project>.supabase.co` + `wss://`) — API/auth, storage images, signed-PDF iframes (public), Realtime websocket. Derived from `NEXT_PUBLIC_SUPABASE_URL` at build time with a hardcoded prod fallback.
- **Google Fonts** — `fonts.googleapis.com` (style), `fonts.gstatic.com` (font). Loaded via `<link>` in both layouts.
- **Google Maps** — `maps.googleapis.com` (script/connect), `maps.gstatic.com`, `*.googleapis.com`, `*.ggpht.com`, `streetviewpixels-pa.googleapis.com` (img: satellite/street-view tiles). Used by public `/place/[token]` and the admin placement editor.
- **`frontend-jypnlxgeua-uc.a.run.app`** — Local Gradient parcel-blueprint raster tiles overlaid on the placement map (img/connect).
- **`worker-src 'self' blob:`** — Sentry Session Replay worker; admin also runs the pdfjs worker (`/pdf.worker.min.mjs`).
- **Sentry needs no origin** — browser events tunnel through same-origin `/monitoring` (`tunnelRoute` in both configs). Don't remove the tunnel without adding Sentry ingest origins to `connect-src`.

Public only:
- **GA4 / GTM** (`www.googletagmanager.com`, `www.google-analytics.com`, `region1.google-analytics.com`, `analytics.google.com`, `stats.g.doubleclick.net`) and **Meta Pixel** (`connect.facebook.net`, `www.facebook.com`) — allowlisted even when the dealer hasn't enabled them, since they're toggled at runtime from admin → Marketing → Integrations.
- **SignWell** (`static.signwell.com` script; `signwell.com` + `*.signwell.com` frame) — embedded signing kiosk on `/sign/[sessionToken]`.
- **Matterport** (`my.matterport.com` + `*.matterport.com` frame) — 3D tour modal. The URL is dealer-pasted; a non-Matterport URL will render a blank modal under CSP.
- **`frame-src 'self'`** — load-bearing: SignWell's iframe navigates to our `/sign/return` on completion, and that navigation is checked against our `frame-src`.

CSP notes: wildcards (`*.signwell.com`) do not match the apex, so apex + wildcard are listed separately. `'unsafe-inline'` in `script-src`/`style-src` is required by Next.js bootstrap scripts, JSON-LD blocks, and inline style attributes; a nonce-based strict CSP would force dynamic rendering of every page (product decision, not a quick fix). `'unsafe-eval'` is dev-only (React Refresh) — production verified working without it, including Google Maps.

## Rollback / de-escalation

- **Softest:** set `CSP_REPORT_ONLY = true` in the affected app's `next.config.mjs` and redeploy — the CSP switches to report-only (console warnings, nothing blocked) while all other headers stay enforced.
- **Fastest:** Vercel dashboard → Instant Rollback (per project, no rebuild).
- HSTS is the only sticky header (browsers cache it up to 2 years). That's harmless here because every web-serving subdomain is on Vercel HTTPS permanently — just never add a plain-HTTP subdomain under upstatehomecenter.com.

## Debugging a blocked resource

Symptom: something third-party doesn't load/fire in production but works locally in `next dev` (dev relaxes eval/websockets only — origins are still enforced, so most misses reproduce in dev too). Check the browser console for `Refused to load … because it violates the following Content Security Policy directive …`, then add the origin to the right directive in that app's `next.config.mjs` and redeploy.
