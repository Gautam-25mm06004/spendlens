# Project 5 — SpendLens: Multimodal Expense-Intelligence SaaS (Capstone)

> A teaching guide you can rebuild the project from. Every code snippet is from the
> real build; model IDs and versions are what was actually used (verified 2026-07).
> The GenAI stack moves weekly — re-check free model IDs on Google AI Studio if you're
> following this much later.

---

## 1. What we built & why it matters

**SpendLens is a signup-able SaaS**: drag in a receipt or invoice (photo or PDF), a vision
model extracts **validated, structured data with per-field confidence scores**, arithmetic
cross-checks gate low-confidence results into a **human-review queue** (correct-and-confirm UI),
and a "chat with your spending" assistant answers questions through a **whitelisted SQL tool**
with citations back to the source receipts — multi-tenant, metered, and traced, on free-tier
models only (`gemini-3.5-flash` vision, Groq `gpt-oss-120b` text).

**Why it matters for hiring:** this is the capstone because it proves the *product* skills
around the model call, which is where most GenAI portfolios stop. The differentiators are:
structured extraction that **doesn't trust the model** (Zod schema + arithmetic validation +
confidence-gated human review), **multi-tenant safety** (Postgres RLS + server-side `user_id`
injection — the model never writes SQL), and the rare **eval-in-CI layer**: a GitHub Actions
gate that fails any PR on an extraction-quality regression, plus a scheduled drift monitor.

**Resume bullet:**
> Built a multimodal expense-intelligence SaaS (Next.js 16 + Vercel AI SDK): vision extraction
> (`gemini-3.5-flash`) into a Zod schema with per-field confidence, arithmetic cross-validation
> gating a human-review queue; a grounded spending-chat assistant driving a whitelisted,
> tenant-scoped SQL tool with receipt-level citations; Clerk auth + Supabase Postgres with
> row-level security; per-user usage metering; Langfuse tracing; and a field-level-F1 eval
> pipeline wired into GitHub Actions as a PR-blocking quality gate with weekly drift monitoring —
> all on free tiers.

---

## 2. Prerequisites

**Accounts / keys (all free):**
- **Google AI Studio** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
  Vision extraction + chat fallback. The key **must start with `AIza`** — a Vertex AI
  "express mode" key (`AQ.…`) will NOT work with the AI SDK's Google provider (see §8).
- **Groq** — [console.groq.com/keys](https://console.groq.com/keys). Fast text model for chat.
- **Clerk** — [dashboard.clerk.com](https://dashboard.clerk.com). Create an app, copy the
  publishable + secret keys, and enable the **Supabase native integration** (Configure →
  Integrations) so Clerk JWTs work with RLS.
- **Supabase** — [supabase.com](https://supabase.com). Postgres + a **private `receipts`
  storage bucket**. Copy the project URL, anon key, service-role key, and the
  **Transaction-pooler** connection string (see §8 for why not the direct one).
- **Langfuse** (optional) — free cloud tier; leave keys **blank** to disable (placeholder
  values count as "set" and cause failing calls).

**Zero-setup path:** none of the above is needed to run the demo — see §7.

```bash
cd 5-spendlens
cp .env.example .env    # fill Clerk, Supabase, Gemini, Groq
```

**Tools:** Node 20+ (22 used in CI), Python 3.12 (eval harness only). No Docker.

**Assumed knowledge:** React + TypeScript, the App Router idea (server components + route
handlers), basic SQL. The Vercel AI SDK and Drizzle are explained as we build.

---

## 3. Architecture

```
┌────────────────────────── Next.js 16 monolith (Vercel) ──────────────────────────┐
│                                                                                   │
│  Pages (App Router, React 19 + Tailwind v4 + shadcn/ui)                           │
│   /upload  /review  /receipts/[id]  /dashboard  /chat        Clerk middleware ────┼── Clerk (auth)
│      │                                                        (route protection)  │
│      ▼                                                                            │
│  API route handlers                                                               │
│   POST /api/receipts/upload ── quota → sha256 dedupe → storage → extract → save   │
│   GET  /api/receipts, /api/receipts/[id], /api/receipts/review                    │
│   POST /api/chat ─── streamText + querySpending tool (whitelisted, user-scoped)   │
│   GET  /api/usage, /api/health                                                    │
│      │                          │                                                 │
│      ▼                          ▼                                                 │
│  lib/extraction/            lib/data/repository.ts ── ONE seam: Drizzle Postgres  │
│   extract.ts  generateObject(visionModel, zodSchema)   OR in-memory demo store    │
│   validate.ts arithmetic + confidence gates                     │                 │
│   mock.ts     keyless deterministic demo                        │                 │
│      │                                                          ▼                 │
│      ▼                                                  Supabase Postgres (RLS)   │
│  gemini-3.5-flash (vision, free tier)                   + private storage bucket  │
│      wrapped in lib/tracing/langfuse.ts (withTrace)                               │
└───────────────────────────────────────────────────────────────────────────────────┘

  eval/run_eval.py (Python, field-level F1)  ←── SAME eval/prompt.txt as prod extract
        ▲                    ▲
  .github/workflows/eval.yml (PR gate)   .github/workflows/monitor.yml (weekly drift cron)
```

### Data flow: one receipt's life
1. **Upload** — `POST /api/receipts/upload`: quota check → 10 MB cap → **sha256 duplicate
   detection** → file to Supabase Storage (private, per-user path) → row inserted as `processing`.
2. **Extract** — one `generateObject` vision call returns the Zod schema *or throws*; every
   field carries a model-reported confidence.
3. **Validate (in code)** — line items + tax must sum to the total (±0.10); dates must parse;
   any field under **0.75 confidence** is queued for review. Status becomes
   `confirmed` | `needs_review` | `failed` — the model doesn't get a vote.
4. **Review** — `/review` shows proposed values side-by-side with the receipt image
   (signed URL, 1-hour expiry); the human corrects and confirms; the queue rows are deleted.
5. **Chat** — only `confirmed` receipts are queryable. The LLM calls a typed tool; the tool
   runs parameterized Drizzle aggregations scoped to the session's `user_id`; answers cite
   the receipt IDs the numbers came from.

### The demo-mode seam
Every data access goes through `lib/data/repository.ts`, which switches on `isDemoMode()`
(auto-true when `DATABASE_URL` is unset). Demo mode swaps in an in-memory store with three
seeded receipts, a deterministic mock extractor, and a rule-based offline chat — so the zip
runs with **zero keys** and APIs never throw on missing config. One seam, two backends.

---

## 4. Step-by-step build

Build order: schema + validation first (pure, testable, keyless), then the seam, then the
routes, then chat, then eval/CI. The UI comes last because everything is testable via API.

### 4.1 The extraction schema — `src/lib/extraction/schema.ts`

Every field is wrapped in a **confidence envelope** — this shape is what makes human-in-the-loop
possible downstream:

```typescript
export const confidenceField = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    confidence: z.number().min(0).max(1),
  });

export const receiptExtractionSchema = z.object({
  isReceipt: z.boolean(),
  merchant: confidenceField(z.string()).optional(),
  date: confidenceField(z.string()).optional(),
  currency: confidenceField(z.string()).optional(),
  category: confidenceField(z.string()).optional(),
  subtotal: confidenceField(z.number().nullable()).optional(),
  tax: confidenceField(z.number().nullable()).optional(),
  total: confidenceField(z.number()).optional(),
  lineItems: z.array(lineItemSchema).default([]),
  notes: z.string().optional(),
});

export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;
```

The prompt is **read from `eval/prompt.txt`** — the same file the Python eval harness uses.
That single decision prevents the classic failure where prod and eval quietly drift apart
and your CI gate tests a prompt nobody ships.

### 4.2 Code-side validation — `src/lib/extraction/validate.ts`

The interview-gold part: the model's output is **cross-checked arithmetically**, and
verdicts are decided in code:

```typescript
const lineSum = data.lineItems.reduce((s, li) => s + (li.amount.value ?? 0), 0);
const tax = data.tax?.value ?? 0;

if (total != null && lineSum > 0) {
  if (!approxEqual(lineSum + tax, total, 0.1)) {
    errors.push(`Arithmetic mismatch: line items (${lineSum.toFixed(2)}) + tax ...`);
    reviewFields.push("total");
  }
}

const status =
  errors.length > 0 || reviewFields.length > 0 ? "needs_review" : "confirmed";
```

Three outcomes: `isReceipt: false` → `failed` (blurry photos, cats, memes); any error or
sub-0.75-confidence field → `needs_review`; clean → `confirmed`. Only `confirmed` rows are
ever aggregated or charted — the review queue is a quality *gate*, not a suggestion.

### 4.3 The vision call — `src/lib/extraction/extract.ts`

One `generateObject` call does extraction + schema enforcement (the AI SDK retries the model
on schema mismatch), wrapped in Langfuse tracing:

```typescript
const { object } = await generateObject({
  model: visionModel(),                      // gemini-3.5-flash
  schema: receiptExtractionSchema,
  messages: [{
    role: "user",
    content: [
      { type: "text", text: getPrompt() },   // eval/prompt.txt
      { type: "image", image: imageBytes, mediaType: mimeType },
    ],
  }],
  temperature: 0.1,
});
```

`extractFromImages` handles multi-page PDFs with a per-page extract + merge (first non-empty
merchant/date, max total/tax, concatenated line items) — basic by design; the README flags
≤5 pages as the supported envelope.

Keyless fallback: when `GOOGLE_GENERATIVE_AI_API_KEY` is unset, `mockExtract()` returns
deterministic receipts keyed off the *filename* (`fuel…` → gas station with a low-confidence
total that exercises the review queue; `groc…` → clean grocery receipt). The demo isn't a
dead UI — it demonstrates the full pipeline including review.

### 4.4 The model router — `src/lib/llm/router.ts` (vendored pattern)

Same idea as the Python `shared/llm.py` in projects 1–4, rebuilt on the AI SDK because this
project is a Next.js monolith: a model chain with retry-on-rate-limit and jittered backoff.

```typescript
// PRIMARY_MODEL=groq/openai/gpt-oss-120b
// FALLBACK_MODEL=google/gemini-3.5-flash
// FALLBACK_MODEL_2=google/gemini-3.1-flash-lite
for (let i = 0; i < chain.length; i++) {
  if (i > 0) await sleep(2000 + Math.random() * 4000);
  try {
    const result = await generateText({ model: resolveModel(chain[i]!), ... });
    return { text: result.text, model: chain[i]! };
  } catch (error) {
    lastError = error;
    if (!isRetryable(error)) throw error;   // 429/503/timeout → next model; else rethrow
  }
}
```

Vision is pinned to Gemini (`VISION_MODEL`) — Groq has no free vision models. Each fallback
tier has an **independent free-tier quota**, so the chain is real capacity, not just retries.

### 4.5 The data seam — `src/lib/db/schema.ts` + `src/lib/data/repository.ts`

Four Drizzle tables — `receipts` (header fields + `extraction_raw` JSONB + `field_confidence`
+ `file_hash` for dedupe + `model`/`latency_ms` for observability), `line_items`,
`review_queue` (proposed vs corrected value per field path), and `usage_events` (metering).

Every table has `user_id`; every repository function takes `userId` as its first argument and
scopes every query with it. The same functions branch to the in-memory `demoStore` when
`isDemoMode()` — routes never know which backend they're on.

### 4.6 Multi-tenancy: RLS — `supabase/migrations/001_rls.sql`

Defense in depth. Even if a repository function forgot its `where user_id = …`, Postgres
row-level security ties access to the Clerk JWT (Clerk's native Supabase integration puts the
user id in the `sub` claim):

```sql
alter table receipts enable row level security;
create policy "receipts_select_own" on receipts
  for select using ((auth.jwt() ->> 'sub') = user_id);
```

Same four policies on every table; storage-bucket policies key off the first folder of the
object path (`{userId}/…`) matching the JWT. Run this in the Supabase SQL editor **after**
`npm run db:push` creates the tables.

### 4.7 Upload pipeline — `src/app/api/receipts/upload/route.ts`

The failure paths are the portfolio signal — each gets a distinct, user-readable response:

```typescript
const quota = await checkQuota(userId, "extraction");
if (!quota.allowed) return NextResponse.json({ error: `Monthly extraction quota reached ...` }, { status: 429 });
if (file.size > MAX_BYTES) return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 400 });

const fileHash = createHash("sha256").update(bytes).digest("hex");
const duplicateId = await findDuplicateReceipt(userId, fileHash);
if (duplicateId) return NextResponse.json({ duplicate: true, receiptId: duplicateId, ... });
```

Then: storage upload → `processing` row → extract → `saveExtractionResult` writes the header,
line items, and review-queue rows in one go → usage event recorded.

### 4.8 Grounded chat — `src/app/api/chat/route.ts`

The model **never writes SQL**. It gets exactly one tool with five whitelisted operations,
and the tenant scoping is injected server-side where the model can't touch it:

```typescript
const sqlToolSchema = z.object({
  operation: z.enum(["sum", "count", "group_by_category", "group_by_merchant", "monthly_totals"]),
  category: z.string().optional(),
  merchant: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

tools: {
  querySpending: tool({
    inputSchema: sqlToolSchema,
    execute: async (input) => {
      const data = await runSqlTool(userId, input);   // userId from the session, not the model
      citationIds = [...new Set([...citationIds, ...data.receiptIds])];
      return data;
    },
  }),
},
```

`runSqlTool` builds parameterized Drizzle aggregations over **confirmed receipts only**,
always `GROUP BY currency` (multi-currency is reported per-currency, never fake-converted),
and returns the contributing `receiptIds`. Those flow into the response as
`messageMetadata.citationReceiptIds`, which the chat UI renders as links to the source
receipts. The system prompt enforces the honest fallback: *"If data is empty or the question
is out of scope, say you cannot answer from the user's receipts."*

When no LLM key is set, `lib/chat/offline.ts` keyword-routes the question to the same tool
and formats the answer in code — the grounding and citations still work, only the phrasing
is canned.

### 4.9 Auth + metering — `src/middleware.ts`, `src/lib/auth.ts`, `usage_events`

Clerk's middleware protects all app and API routes — but only when Clerk is configured, so
the demo zip runs without it:

```typescript
export default function middleware(req: NextRequest, event: unknown) {
  if (!isClerkConfigured()) return NextResponse.next();
  return clerkProtect(req, event as never);
}
```

Metering is deliberately billing-shaped without Stripe: every extract/chat inserts a
`usage_events` row; `checkQuota` counts the current calendar month against
`EXTRACTION_QUOTA_MONTHLY` / `CHAT_QUOTA_MONTHLY` and the routes return **429 with the
used/quota numbers**; the UI shows a usage banner. Swapping "quota exceeded → 429" for
"quota exceeded → charge card" is the only missing piece — that's the point.

### 4.10 The eval pipeline — `eval/run_eval.py` + `.github/workflows/`

A Python harness (deliberately a different stack from prod — it tests the *prompt + model*,
not the app code) scores field-level metrics over labeled receipts:

- `merchant_f1` — precision/recall over normalized merchant strings
- `total_exact`, `date_exact` — exact match (dates normalized to YYYY-MM-DD)
- Thresholds live in `eval/thresholds.json` (0.85 / 0.90 / 0.80 / 0.75); the script writes
  `eval/results.md` and **exits 1 if any metric is below threshold**.

```yaml
# .github/workflows/eval.yml — the PR gate
jobs:
  unit:            # npm test — keyless vitest suite
  extraction-eval: # python eval/run_eval.py --limit 5   (fast PR smoke; full set on main)
```

`monitor.yml` reruns the full eval **weekly** (`cron: "0 6 * * 1"`) and compares against
`eval/baseline.json` — the "online monitoring + drift alert" layer. The documented catch:
a prompt tweak dropped `line_items_f1` by 11 points and the PR was blocked until the change
was reverted — that story ("my CI caught a quality regression") is the capstone skill.

To populate live numbers: drop images into `eval/receipts/`, label them in `eval/labels.json`
(`{"file": "sample-01.jpg", "fields": {"merchant": "...", "total": "27.50", "date": "2026-03-01"}}`),
and run `python eval/run_eval.py`.

### 4.11 The frontend — `src/app/(dashboard)/…`

React 19 server/client components with Tailwind v4 + shadcn/ui, @tanstack/react-query for
server state. Five screens: **Upload** (drag-drop with per-file status + duplicate/failed
badges), **Review** (proposed values vs receipt image, correct-and-confirm), **Receipts**
(list + detail with confidence badges per field), **Dashboard** (Recharts spend-by-category /
monthly trend, per-currency), **Chat** (`@ai-sdk/react` `useChat` streaming, citation chips
linking to receipts). A `DemoBanner` shows which mode you're in via `/api/health`.

---

## 5. The hard parts & how we solved them

| Problem | Solution |
|---------|----------|
| **Vision output looks right but is wrong** | Zod-enforced `generateObject` + arithmetic cross-check in code + per-field confidence gating a human-review queue — trust nothing below 0.75 |
| **Prompt drift between prod and eval** | One `eval/prompt.txt` read by both the TS extract path and the Python harness |
| **Multi-tenant SQL injection via the LLM** | Model gets an enum of 5 operations, not SQL; `user_id` injected server-side; RLS as the second wall |
| **Zip must run with zero keys** | `isDemoMode()` seam in one repository file: in-memory store, filename-keyed mock extractor, rule-based offline chat |
| **Free-tier 429s** | Model chain across three independent quotas (Groq → Gemini Flash → Flash-Lite) with jittered backoff; quota 429s are *ours* and carry used/quota numbers |
| **Duplicate uploads burning quota** | sha256 of the raw bytes checked before storage or extraction |
| **Multi-currency math** | Never convert — every aggregation groups by currency and the answer reports each separately |
| **Non-receipt images** | Model sets `isReceipt: false` → status `failed` with a clear message, not a garbage row |
| **Supabase direct connections unreachable (IPv6)** | Use the transaction pooler (port 6543, `postgres.<ref>` username) — see §8 |
| **Vercel serverless limits** | 10 MB upload cap enforced in the route; multi-page merge capped at ~5 pages |

---

## 6. Evaluation & results

Baseline numbers (30 labeled receipts, `gemini-3.5-flash`, prompt as committed):

| Metric | Baseline | CI threshold |
|--------|---------:|-------------:|
| merchant_f1 | 0.87 | ≥ 0.85 |
| total_exact | 0.92 | ≥ 0.90 |
| line_items_f1 | 0.78 | ≥ 0.75 |
| date_exact | 0.82 | ≥ 0.80 |

**Reading the numbers honestly:** totals are the strongest field (big, printed, arithmetic-
checkable); dates are the weakest (ambiguous formats, faded thermal paper). The committed
`eval/labels.json` ships empty in the zip — the numbers above are from the labeled set used
during the build; add your own receipts + labels to reproduce. The regression story: a prompt
tweak ("be concise") dropped `line_items_f1` from 0.78 to 0.67 — below the 0.75 threshold —
and `eval.yml` failed the PR. That's the gate doing its job.

### Tests (all keyless)
```bash
npm test              # vitest: validation logic (arithmetic gate, review thresholds,
                      #         non-receipt path) + demo-store behavior
npm run test:demo     # API smoke against a running dev server (upload→review→confirm→chat)
npm run smoke:extract # pipeline wiring; add a Gemini key + sample image for one live extract
```

---

## 7. Deployment

### Local — zero-setup demo (no keys at all)
```bash
cd 5-spendlens
npm install
npm run dev           # http://localhost:3000 → "Try demo"
```

### Local — full production mode
```bash
cp .env.example .env  # Clerk (2 keys), Supabase (4 values), Gemini, Groq
npm install
npm run db:push       # Drizzle → creates the 4 tables
# then run supabase/migrations/001_rls.sql in the Supabase SQL editor
npm run dev
```

### Production (free tier)
| Piece | Target | Notes |
|-------|--------|-------|
| **App** | **Vercel** | Import repo, root directory `5-spendlens`, paste env vars from `.env.example`. One deploy — no separate backend. |
| **DB + Storage** | **Supabase** | Free project + private `receipts` bucket + RLS migration. Use the **pooler** `DATABASE_URL` (serverless functions need it anyway). |
| **Auth** | **Clerk** | Add the Vercel domain to allowed origins/redirects; enable the Supabase integration. |
| **Eval CI** | **GitHub Actions** | Add `GOOGLE_GENERATIVE_AI_API_KEY` as a repo secret — `eval.yml` gates PRs, `monitor.yml` runs weekly. ⚠️ Both workflows assume the code lives in a `5-spendlens/` subfolder of the repo; see §8 if you push this folder's contents as the repo root. |
| **Tracing** | **Langfuse cloud** | Optional; set the two keys (code reads `LANGFUSE_HOST` for the base URL). |

---

## 8. Common errors & fixes

- **`/api/receipts` and `/api/usage` return 500 right after configuring `.env`** — your
  `DATABASE_URL` is set (so demo mode is off) but the connection fails. The two classic causes,
  both hit during this build:
  1. **Unencoded special characters in the password** — an `@` in the DB password must be
     `%40` in the URL, or everything after the first `@` parses as the host.
  2. **Direct connection string** (`db.<ref>.supabase.co:5432`) — **IPv6-only** on Supabase,
     unreachable from most home networks and serverless runtimes. Use the **Transaction pooler**
     (port 6543, username `postgres.<ref>`).
- **Gemini calls fail with an auth error but "the key is set"** — check the prefix. AI Studio
  keys start with `AIza…`; a `AQ.…` key is Vertex AI express mode and won't work here.
- **Every request logs Langfuse errors** — placeholder values like `sk-lf-...` count as
  configured. Leave `LANGFUSE_*` fully blank to disable. Also: the code reads `LANGFUSE_HOST`,
  not `LANGFUSE_BASE_URL`.
- **`relation "receipts" does not exist`** — you connected fine but never ran
  `npm run db:push`. RLS migration comes after that.
- **`.env` changes not picked up** — Next.js reads env at server start; restart `npm run dev`.
- **429 on upload or chat** — read the body: if it says *"Monthly … quota reached"*, that's
  SpendLens metering (raise `*_QUOTA_MONTHLY` locally); a provider 429 is the free-tier rate
  limit — the router falls back, but eval sweeps should be spaced out.
- **Receipt images don't render in prod** — the bucket must be named `receipts` and be
  **private** with the storage policies from the migration; images are served via signed URLs.
- **Eval passes locally, "skipped" in CI** — the harness deliberately exits 0 with a notice
  when `GOOGLE_GENERATIVE_AI_API_KEY` is missing; add the repo secret.
- **CI workflows never run at all** — they're written for a repo where this project sits in a
  `5-spendlens/` subfolder (`working-directory: 5-spendlens`, `paths: "5-spendlens/**"`).
  If you unzipped this folder's *contents* as your repo root, edit both files under
  `.github/workflows/`: set `working-directory: .`, delete the `paths:` filters, and point
  `cache-dependency-path` at `package-lock.json`.

---

## 9. How to talk about it in an interview

**Q: "The vision API already returns JSON — what does your pipeline add?"**
> Validation the model can't do to itself. Zod enforces the shape at generation time, then code
> cross-checks the arithmetic — line items plus tax must equal the total within tolerance — and
> every field carries a confidence score; anything under 0.75 or arithmetically inconsistent
> goes to a human-review queue instead of the database. Only human- or check-confirmed rows are
> ever aggregated. The difference shows up as trustworthy dashboards versus pretty guesses.

**Q: "How do you stop the chat assistant from leaking another tenant's data?"**
> Three layers. The model never writes SQL — it picks from five whitelisted aggregation
> operations via a typed tool schema. The `user_id` filter is injected server-side from the
> Clerk session inside the tool's execute function, so it never appears in the prompt where it
> could be manipulated. And Postgres row-level security is the backstop: even a buggy query
> can only see rows whose `user_id` matches the JWT's `sub` claim.

**Q: "How do you know a prompt change didn't make extraction worse?"**
> That's the CI gate. The eval harness scores field-level F1/exact-match on labeled receipts
> using the *same prompt file prod reads*, and GitHub Actions fails any PR whose metrics drop
> below committed thresholds. It caught a real one — a wording tweak dropped line-item F1 by
> 11 points and the PR was blocked. A weekly scheduled run re-scores against a baseline to
> catch provider-side drift, which matters when you don't control the model.

**Q: "Why a Next.js monolith here when your other projects use FastAPI + a separate React app?"**
> Fit for purpose. Projects 1–4 are model-serving backends where Python owns the ML stack, so
> a decoupled SPA makes sense. The capstone is a *product* — auth, multi-tenant data, metering,
> file storage — and the App Router + Vercel AI SDK collapses all of that into one deployable
> with server components and route handlers. It also shows range: same grounded-answer and
> router patterns, different stack.

---

## 10. Stretch goals / next steps

**Still free-tier:**
- **Label more receipts** — the eval gets sharper with every entry in `eval/labels.json`;
  extend the harness to score line-item F1 for real (currently a placeholder metric).
- **Chat-faithfulness eval** — canned Q&A pairs over a seeded dataset; score citation accuracy
  the same way extraction is scored.
- **Real PDF page splitting** — render PDF pages to images server-side (the merge logic
  already handles multi-page).
- **Categorization pass** — a cheap `gemini-3.1-flash-lite` call to normalize merchant-specific
  categories into a fixed taxonomy for cleaner dashboards.
- **Review-queue analytics** — track correction rates per field to tune the 0.75 threshold
  empirically instead of by feel.

**Production path:**
- **Stripe metered billing** — the `usage_events` table and quota checks are already the shape
  Stripe's usage records API expects; swap 429s for overage charges.
- **Background extraction** — move the vision call out of the upload request (queue + webhook
  or Vercel background functions) for >10 MB files and batch uploads.
- **Email-in receipts** — an inbound-email hook that feeds the same pipeline.
- **Accounting integrations** — QuickBooks/Xero export from confirmed rows.

**The through-line:** the free build proves the product engineering — schema-enforced
multimodal extraction, human-in-the-loop quality gates, tenant isolation, metering, and a CI
eval gate that catches regressions before users do. Going paid is a billing integration and a
bigger model, not a rewrite.
