# SpendLens

A multi-user web app for receipts and invoices. Upload a photo or PDF and a vision model extracts the merchant, date, currency, category, tax, total and line items, each with a confidence score. Code then checks the numbers: if the line items plus tax do not add up to the total, or any field is below 0.75 confidence, the receipt goes to a review queue where you correct and confirm it. Only confirmed receipts feed the dashboard and the chat assistant, which answers questions about your spending through a fixed set of database queries and links each answer to the receipts it came from.

It also runs with no accounts or keys at all: without a database URL it switches to a demo mode with an in-memory store, three sample receipts, a mock extractor and a rule-based chat.

## Architecture

```
Next.js 16 app (App Router, React 19, Tailwind v4, shadcn/ui)

  pages:  /upload  /review  /receipts/[id]  /dashboard  /chat          Clerk middleware protects routes

  POST /api/receipts/upload   quota check → 10 MB cap → sha256 duplicate check → storage
                              → vision extraction → validation → save (confirmed | needs_review | failed)
  GET  /api/receipts, /api/receipts/[id], /api/receipts/review
  POST /api/chat              streamText + one querySpending tool (5 fixed operations, scoped to the user)
  GET  /api/usage, /api/health

  lib/extraction   schema.ts (Zod), extract.ts (generateObject with Gemini), validate.ts, mock.ts
  lib/data         repository.ts: the one data layer, Drizzle + Supabase Postgres, or the demo store
  lib/llm          router.ts: Groq gpt-oss-120b → Gemini Flash → Gemini Flash-Lite for text
  lib/tracing      Langfuse (optional)

  Supabase Postgres with row-level security + a private "receipts" storage bucket

  eval/run_eval.py  Python harness using the same eval/prompt.txt as the app
  .github/workflows/eval.yml     unit tests + extraction eval on every push and pull request
  .github/workflows/monitor.yml  weekly full eval compared against eval/baseline.json
```

| Layer | Choice |
|---|---|
| App | Next.js 16, React 19, Tailwind v4, @tanstack/react-query, Recharts |
| Auth | Clerk, using its Supabase integration so JWTs work with row-level security |
| Database and files | Supabase Postgres (Drizzle ORM) and a private storage bucket |
| Extraction | Vercel AI SDK `generateObject` with `gemini-3.5-flash` and a Zod schema |
| Chat | Vercel AI SDK `streamText` with one typed tool |
| Tracing | Langfuse JS SDK (optional) |
| Tests and eval | Vitest, a Python eval script, GitHub Actions |

Design reasoning and the failure cases the code handles are in [docs/DESIGN.md](docs/DESIGN.md).

## Evaluation

[`eval/run_eval.py`](eval/run_eval.py) scores extraction on labelled receipts: merchant F1 on normalised names, exact match on the total, and exact match on the date (YYYY-MM-DD). It reads the same prompt file as the app, writes `eval/results.md` and `eval/results.json`, and exits with code 1 if any metric is below its threshold in [`eval/thresholds.json`](eval/thresholds.json) (merchant 0.85, total 0.90, date 0.80). The CI workflow runs it on every pull request (first 5 receipts) and the weekly monitor runs the full set and compares it with [`eval/baseline.json`](eval/baseline.json).

The repository does not include labelled receipts yet, so there are no committed scores and the eval currently exits early with a notice. To produce real numbers:

1. Put receipt images in `eval/receipts/`.
2. Label them in `eval/labels.json`, e.g. `{"file": "r01.jpg", "fields": {"merchant": "Big Bazaar", "total": "1249.00", "date": "2026-09-14"}}`.
3. Run `python eval/run_eval.py` with `GOOGLE_GENERATIVE_AI_API_KEY` set, then copy the metrics from `eval/results.json` into `eval/baseline.json`.

Line items are not scored yet.

## Run it locally

### Demo mode (no accounts or keys)

```bash
npm install
npm run dev          # http://localhost:3000 → "Try demo"
```

File names drive the mock extractor: a name containing `fuel`, `gas` or `petrol` comes back with low-confidence fields and lands in the review queue; one containing `groc`, `mart` or `super` comes back as a grocery receipt.

### Full mode

```bash
cp .env.example .env    # Clerk (2 keys), Supabase (4 values), Gemini, Groq
npm install
npm run db:push         # creates the 4 tables
# then run supabase/migrations/001_rls.sql in the Supabase SQL editor
npm run dev
```

Use Supabase's transaction pooler connection string (port 6543) as `DATABASE_URL`; the direct connection is IPv6-only and often unreachable. Set `DEMO_MODE=false` to require Postgres even in development.

### Tests

```bash
npm test               # Vitest: validation rules, review thresholds, non-receipt path, demo store
npm run test:demo      # API smoke test against a running dev server (upload → review → confirm → chat)
npm run smoke:extract  # extraction wiring; with a Gemini key and a sample image, one live call
```

## Deploying

1. **Supabase:** create a project and a private bucket named `receipts`, run `npm run db:push`, then the RLS migration.
2. **Clerk:** enable the Supabase integration and add the deployment URL to the allowed redirects.
3. **Vercel:** import the repository and copy the variables from `.env.example`.
4. **GitHub Actions:** add `GOOGLE_GENERATIVE_AI_API_KEY` as a repository secret so the eval jobs run; without it they skip with a notice.

## Limitations

* No payments; usage is metered and limited by monthly quotas, and over-quota requests return 429.
* No currency conversion. Totals are always grouped by currency.
* Handwritten receipts are best effort.
* Multi-page PDFs are extracted page by page and merged; up to about 5 pages is supported.
* Uploads are capped at 10 MB to stay within serverless limits.
* The extraction eval has no labelled data yet (see above).

## License

MIT
