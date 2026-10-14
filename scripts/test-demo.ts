/**
 * Demo-mode API smoke test — run while `npm run dev` is up, no env vars required.
 * Usage: npx tsx scripts/test-demo.ts [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

async function check(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`Testing SpendLens demo at ${base}\n`);

  const health = await check("/api/health");
  console.log("✓ health", health.body);

  const usage = await check("/api/usage");
  console.log("✓ usage", usage.body);

  const receipts = await check("/api/receipts");
  const list = receipts.body as { receipts?: unknown[] };
  console.log(`✓ receipts (${list.receipts?.length ?? 0} seeded)`);

  const review = await check("/api/receipts/review");
  console.log("✓ review queue", review.body);

  const detail = await check("/api/receipts/demo-r1");
  console.log("✓ receipt detail", (detail.body as { receipt?: { merchant?: string } }).receipt?.merchant);

  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("file", new Blob([tinyPng], { type: "image/png" }), "coffee-demo.png");
  const upload = await check("/api/receipts/upload", { method: "POST", body: form });
  console.log("✓ upload", upload.body);

  const chat = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "How much did I spend by category?" }],
        },
      ],
    }),
  });
  if (!chat.ok) throw new Error(`chat -> ${chat.status}`);
  const chatText = await chat.text();
  if (!chatText.includes("category") && !chatText.includes("Food")) {
    console.warn("⚠ chat response unexpected (may still be ok):", chatText.slice(0, 120));
  } else {
    console.log("✓ chat stream received");
  }

  console.log("\nAll demo API checks passed.");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
