# SpendLens: design notes

Why extraction is validated in code, how tenant data stays separate, how the chat stays grounded, and how the evaluation is wired into CI. Setup is in the README.

## 1. The problem

A vision model will happily return well-formed JSON for a receipt with a wrong total, a misread date or a made-up merchant. For an expense tool that is worse than no data, because the dashboard looks trustworthy. So the rule is: the model proposes, code checks, and a person confirms anything doubtful. Only confirmed rows are ever summed, charted or used to answer questions.

The same thinking applies to the chat assistant. It must not see other users' data, and it must not write its own SQL.

## 2. A receipt's path

1. **Upload** (`POST /api/receipts/upload`): monthly quota check, 10 MB cap, SHA-256 of the file to catch duplicates before any storage or model call, upload to a private per-user path in Supabase Storage, row created as `processing`.
2. **Extract:** one `generateObject` call with the image and the prompt from `eval/prompt.txt`. The AI SDK enforces the Zod schema and retries the model if the output does not match. Every field comes wrapped as `{ value, confidence }`.
3. **Validate** ([`validate.ts`](../src/lib/extraction/validate.ts)): line items plus tax must equal the total within 0.10, the date must parse, and any field under 0.75 confidence is flagged. Result: `failed` if the model says it is not a receipt, `needs_review` if any check fails or any field is flagged, otherwise `confirmed`.
4. **Review:** `/review` shows the proposed values next to the image (signed URL, one-hour expiry). The user corrects and confirms, and the queue rows are removed.
5. **Use:** dashboard and chat read only `confirmed` receipts.

## 3. Decisions and why

**A confidence envelope on every field.** The schema wraps each value with a confidence score. That is what makes per-field review possible: the review screen can highlight exactly the fields that need a human.

**One prompt file for the app and the eval.** Both the TypeScript extractor and the Python harness read `eval/prompt.txt`. If they had separate copies, the CI gate could end up testing a prompt that is not the one in production.

**The chat model never writes SQL.** It gets one tool, `querySpending`, whose input is a Zod schema with an `operation` enum (`sum`, `count`, `group_by_category`, `group_by_merchant`, `monthly_totals`) and optional category, merchant and date filters. The tool's `execute` function adds the `user_id` from the server session; it never comes from the model. `runSqlTool` builds parameterised Drizzle queries over confirmed receipts only, always groups by currency, and returns the IDs of the receipts that contributed. Those IDs are sent with the reply and shown as links. If the data is empty or the question is out of scope, the system prompt requires the model to say it cannot answer from the user's receipts.

**Row-level security as a second wall.** Every table has a `user_id` and every repository function filters by it. On top of that, [`001_rls.sql`](../supabase/migrations/001_rls.sql) adds Postgres policies that compare `user_id` with the `sub` claim of the Clerk JWT, and the storage policies require the first folder of an object path to be the user's ID. A query that forgets its filter still cannot read another user's rows.

**One data layer, two backends.** All reads and writes go through [`repository.ts`](../src/lib/data/repository.ts). When `DATABASE_URL` is not set (or `DEMO_MODE=true`) it uses an in-memory store with three sample receipts; the extractor falls back to a deterministic mock keyed off the file name, and the chat falls back to keyword routing onto the same tool with templated answers. Route handlers do not know which backend they are on, and nothing throws because a key is missing.

**No currency conversion.** Receipts keep their own currency and every total is reported per currency. A live FX rate would make historical totals change every day.

**Metering shaped like billing.** Every extraction and chat call inserts a `usage_events` row. `checkQuota` counts the current month against `EXTRACTION_QUOTA_MONTHLY` and `CHAT_QUOTA_MONTHLY`, and the routes return 429 with the used and allowed counts. Replacing the 429 with a charge is the only step missing for paid plans.

**Model chain for text.** `router.ts` tries Groq `gpt-oss-120b`, then Gemini Flash, then Gemini Flash-Lite, with jittered backoff, moving on only for retryable errors (429, 503, timeouts). Vision is pinned to Gemini because Groq has no free vision model.

**A Next.js monolith.** Auth, multi-user data, file storage, metering and streaming chat all fit in route handlers and server components, so there is one deployable instead of an API plus a separate frontend.

## 4. Failure cases the code handles

| Situation | How the code deals with it |
|---|---|
| Plausible but wrong extraction | Schema enforcement, arithmetic check and confidence threshold; anything doubtful goes to review |
| Not a receipt (a blurry photo, a screenshot) | The model sets `isReceipt: false`; the row is marked `failed` with a message instead of saving junk |
| Same file uploaded twice | SHA-256 match returns the existing receipt before storage or extraction |
| Prompt injection through the chat | No free-form SQL; a closed set of operations; tenant filter added server-side; RLS underneath |
| Mixed currencies | Every aggregation groups by currency |
| Free-tier rate limits | Model chain with backoff for providers; quota 429s are the app's own and say how much is used |
| Multi-page PDFs | Page-by-page extraction merged (first non-empty merchant and date, largest total and tax, all line items) |
| Supabase direct connection unreachable | Use the transaction pooler (port 6543, user `postgres.<ref>`); special characters in the password must be URL-encoded |
| Placeholder Langfuse keys | Leave `LANGFUSE_*` empty to disable; a placeholder counts as configured and every call logs errors |

## 5. Evaluation and CI

* **Unit tests (Vitest):** the validation rules (arithmetic gate, confidence threshold, non-receipt path) and demo-store behaviour. No keys needed.
* **Extraction eval** ([`eval/run_eval.py`](../eval/run_eval.py)): merchant F1, total exact match and date exact match against `eval/labels.json`. It writes `eval/results.md` and `eval/results.json` and exits non-zero if a metric is below `eval/thresholds.json`.
* **`eval.yml`:** on every push and pull request, runs the unit tests and the eval on the first 5 labelled receipts.
* **`monitor.yml`:** every Monday, runs the full eval and fails if any metric has dropped more than 0.03 below `eval/baseline.json`. This catches the provider changing the model underneath, which no code change would reveal.

Current state: the repository has no labelled receipts yet, so the eval exits early with a notice and there is no baseline. The gate becomes meaningful as soon as labelled receipts are added; the README lists the steps.

## 6. What I would do next

1. **Label 30 to 50 receipts** (a mix of printed, thermal and handwritten) and commit the first baseline.
2. **Score line items** by matching predicted and labelled items on description and amount.
3. **Measure the review queue:** log how often each field is corrected and use that to set the 0.75 threshold from data rather than by hand.
4. **Evaluate the chat:** canned questions over the seeded data, scoring both the numbers and whether the cited receipts are the right ones.
5. **Move extraction off the request:** a queue and webhook for large files and batch uploads.
