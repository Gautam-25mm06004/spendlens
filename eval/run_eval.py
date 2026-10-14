#!/usr/bin/env python3
"""SpendLens extraction eval — field-level F1 against labels.json.

Usage:
  python eval/run_eval.py
  python eval/run_eval.py --limit 5   # quick PR smoke

Requires GOOGLE_GENERATIVE_AI_API_KEY. Reads eval/prompt.txt (shared with prod).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVAL = ROOT / "eval"
PROMPT = (EVAL / "prompt.txt").read_text(encoding="utf-8")
THRESHOLDS = json.loads((EVAL / "thresholds.json").read_text(encoding="utf-8"))


def normalize_merchant(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def normalize_date(s: str) -> str:
    return s.strip()[:10]


def score_field(predictions: list[str], truths: list[str]) -> float:
    if not truths:
        return 1.0
    correct = sum(1 for p, t in zip(predictions, truths) if p == t)
    return correct / len(truths)


def merchant_f1(preds: list[str], truths: list[str]) -> float:
    tp = sum(1 for p, t in zip(preds, truths) if p == t and p)
    fp = sum(1 for p, t in zip(preds, truths) if p != t and p)
    fn = sum(1 for p, t in zip(preds, truths) if p != t and t)
    prec = tp / (tp + fp) if (tp + fp) else 0
    rec = tp / (tp + fn) if (tp + fn) else 0
    return 2 * prec * rec / (prec + rec) if (prec + rec) else 0


def extract_with_gemini(image_path: Path) -> dict:
    from google import genai

    client = genai.Client(api_key=os.environ["GOOGLE_GENERATIVE_AI_API_KEY"])
    model = os.getenv("VISION_MODEL", "gemini-3.5-flash").replace("google/", "")
    uploaded = client.files.upload(file=str(image_path))
    response = client.models.generate_content(
        model=model,
        contents=[PROMPT, uploaded],
        config={"response_mime_type": "application/json"},
    )
    return json.loads(response.text or "{}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    if not os.getenv("GOOGLE_GENERATIVE_AI_API_KEY"):
        print("GOOGLE_GENERATIVE_AI_API_KEY not set — skipping live eval (CI should set secret).")
        # Keyless gate: still validate thresholds file exists
        return 0

    labels = json.loads((EVAL / "labels.json").read_text(encoding="utf-8"))
    if not labels:
        print("No labels in eval/labels.json — add labeled receipts before full eval.")
        (EVAL / "results.md").write_text(
            "# Eval results\n\nNo labeled data yet. Add entries to `eval/labels.json`.\n",
            encoding="utf-8",
        )
        return 0

    if args.limit:
        labels = labels[: args.limit]

    merchants_p, merchants_t = [], []
    totals_p, totals_t = [], []
    dates_p, dates_t = [], []

    for item in labels:
        img = EVAL / "receipts" / item["file"]
        if not img.exists():
            print(f"Missing image: {img}")
            continue
        pred = extract_with_gemini(img)
        truth = item["fields"]
        merchants_p.append(normalize_merchant(str(pred.get("merchant", {}).get("value", pred.get("merchant", "")))))
        merchants_t.append(normalize_merchant(truth.get("merchant", "")))
        totals_p.append(str(pred.get("total", {}).get("value", pred.get("total", ""))))
        totals_t.append(str(truth.get("total", "")))
        dates_p.append(normalize_date(str(pred.get("date", {}).get("value", pred.get("date", "")))))
        dates_t.append(normalize_date(truth.get("date", "")))

    metrics = {
        "merchant_f1": merchant_f1(merchants_p, merchants_t),
        "total_exact": score_field(totals_p, totals_t),
        "date_exact": score_field(dates_p, dates_t),
        "n": len(merchants_t),
    }

    lines = [
        "# SpendLens eval results",
        "",
        f"Samples: {metrics['n']}",
        "",
        "| Metric | Score | Threshold | Pass |",
        "|--------|-------|-----------|------|",
    ]
    failed = False
    for key, threshold in THRESHOLDS.items():
        score = metrics.get(key, 0)
        ok = score >= threshold
        if not ok:
            failed = True
        lines.append(f"| {key} | {score:.3f} | {threshold} | {'✅' if ok else '❌'} |")

    (EVAL / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (EVAL / "results.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print("\n".join(lines))

    if failed:
        print("\nEVAL FAILED — metrics below threshold.")
        return 1
    print("\nEVAL PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
