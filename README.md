# UHS — Upstate Home Sales

A multi-tenant SaaS for South Carolina manufactured home dealers. The killer feature: dealers price homes by **base price + markup percentage**, and the public site only ever sees the listed price.

## What's in this repo

This is a **high-fidelity HTML prototype** — a complete design spec, not production code. The dev's job is to rebuild it on Next.js + Supabase using `handoff.html` as the technical spec.

```
.
├─ CLAUDE.md            ← read me first (primary instructions for Claude Code)
├─ handoff.html         ← THE technical spec — Supabase schema, RLS, API, deploy
├─ design-system/       ← tokens.css + admin.css (lift these to production)
├─ brand/               ← brand identity guide (logo, palette, type, voice)
├─ site/                ← public site — 13 pages + 00-overview.html canvas
├─ admin/               ← dealer admin — 8 screens + 00-overview.html canvas
└─ research/            ← competitive teardown + screenshots of 9 competitors
```

## Open `handoff.html` first

Everything the dev needs is in `handoff.html` — data model with full SQL, RLS policies, API surface, auth flow, storage buckets, environment variables, and a 7-week cutover roadmap. It's organized into 11 numbered sections.

## Two visual overviews

Each is a pan/zoom canvas showing all screens at once:
- `site/00-overview.html` — the 13 public pages
- `admin/00-overview.html` — the 8 admin screens

Click any artboard to focus it fullscreen.

## Six open product questions

The bottom of `handoff.html` has 6 questions that should be the dev's first conversation with the product team — they unblock the schema and the lead flow. Don't skip them.
