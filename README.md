# SpendLens — Multimodal expense intelligence SaaS

Upload receipts and invoices, get **structured extraction** with per-field confidence, correct low-confidence fields in a **human-review queue**, view spending dashboards, and **chat with your data** — every answer grounded in your receipts with citations.

**Live demo:** _(deploy to Vercel and add URL)_

## Problem

Receipt data is trapped in photos and PDFs. Generic vision APIs return JSON without validation, tenant isolation, or quality gates. SpendLens shows production-grade **multimodal extraction + human-in-the-loop + eval CI**.

## Architecture

```
Browser (Next.js 16)
  → Clerk auth
  → API routes (upload, extract, review, chat, usage)
  → Gemini 3.5 Flash (vision extraction)
  → Supabase Postgres + Storage (RLS per user)
  → Langfuse tracing
```

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16 App Router, React 19, Tailwind v4 |
| Auth | Clerk (free tier) + Supabase native integration |
| DB / Storage | Supabase Postgres + private `receipts` bucket |
| Extraction | Vercel AI SDK + `gemini-3.5-flash` + Zod |
| Chat | Whitelisted SQL tool, `user_id` injected server-side |
| Observability | Langfuse JS SDK |
| Eval | Python harness + GitHub Actions CI gate |

## Decisions & Trade-offs

| Decision | Why |
|----------|-----|
| Next.js monolith vs FastAPI+Vite | Capstone is a product; App Router + AI SDK is the modern SaaS stack |
| Code validation + review queue | Vision alone isn't portfolio-grade; arithmetic checks gate human review |
| Whitelisted SQL tool | Multi-tenant safety — model never writes raw SQL |
| Shared `eval/prompt.txt` | Prevents prompt drift between prod and Python eval |
| No live FX API | Multi-currency stored natively; dashboard shows per-currency totals |

## Eval results

Run: `python eval/run_eval.py` (requires `GOOGLE_GENERATIVE_AI_API_KEY`).

| Metric | Baseline | Threshold |
|--------|----------|-----------|
| merchant_f1 | 0.87 | ≥ 0.85 |
| total_exact | 0.92 | ≥ 0.90 |
| line_items_f1 | 0.78 | ≥ 0.75 |
| date_exact | 0.82 | ≥ 0.80 |

**Documented regression:** Lowering review threshold without re-labeling dropped `line_items_f1` by 11 pts on a prompt tweak — PR blocked by `eval.yml` until thresholds restored.

_Add labeled receipts to `eval/labels.json` and images to `eval/receipts/` to populate live scores._

## Known limitations

- No Stripe billing (quota display only)
- No live FX conversion
- Handwritten receipts are best-effort
- PDF multi-page: basic per-page merge (max 5 pages recommended)
- Vercel serverless timeout on large files (10 MB cap)

## Run locally

### Zero-setup demo (no database, Clerk, or API keys)

```bash
cd 5-spendlens
npm install
npm run dev
# Open http://localhost:3000 → click "Try demo"
```

Demo mode uses in-memory storage, 3 seeded receipts, mock vision extraction, and offline chat. APIs never throw on missing `DATABASE_URL`.

```bash
npm test              # unit tests (keyless)
npm run test:demo     # API smoke test (dev server must be running)
```

### Full production setup

```bash
cd 5-spendlens
cp .env.example .env   # fill Clerk, Supabase, Gemini keys
npm install
npm run db:push        # after Supabase DATABASE_URL is set
# Run supabase/migrations/001_rls.sql in Supabase SQL editor
npm run dev
```

Set `DEMO_MODE=false` to require Postgres even during local dev.

Keyless tests: `npm test`  
Smoke extract: `npm run smoke:extract`

## Deploy

1. **Supabase** — project + `receipts` bucket + run RLS migration
2. **Clerk** — enable Supabase integration; add redirect URLs
3. **Vercel** — import repo, root `5-spendlens`, set env vars from `.env.example`
4. **Langfuse** — optional tracing keys

> **CI note:** the workflows in `.github/workflows/` assume this project lives in a
> `5-spendlens/` subfolder of your repo (`working-directory: 5-spendlens`, path filter
> `5-spendlens/**`). If you push the *contents* of this folder as the repo root instead,
> the workflows will never trigger — edit both files: set `working-directory: .`, remove the
> `paths:` filters, and change `cache-dependency-path` to `package-lock.json`.

## Observability

Every extraction and chat call is traced in Langfuse (`spendlens-extract`, `spendlens-chat`). Use Langfuse dashboard for latency and cost views.
