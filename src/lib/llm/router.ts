import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText, streamText, type LanguageModel } from "ai";

const PRIMARY_MODEL = process.env.PRIMARY_MODEL ?? "groq/openai/gpt-oss-120b";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL ?? "google/gemini-3.5-flash";
const FALLBACK_MODEL_2 =
  process.env.FALLBACK_MODEL_2 ?? "google/gemini-3.1-flash-lite";
export const VISION_MODEL =
  process.env.VISION_MODEL ?? "google/gemini-3.5-flash";

function parseModelId(modelId: string): { provider: string; model: string } {
  const slash = modelId.indexOf("/");
  if (slash === -1) return { provider: "google", model: modelId };
  return {
    provider: modelId.slice(0, slash),
    model: modelId.slice(slash + 1),
  };
}

function resolveModel(modelId: string): LanguageModel {
  const { provider, model } = parseModelId(modelId);
  if (provider === "groq") {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return groq(model);
  }
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  return google(model);
}

function modelChain(primary: string, fallback?: string | null): string[] {
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of [primary, fallback, FALLBACK_MODEL_2]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      chain.push(m);
    }
  }
  return chain;
}

function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|503|502|timeout|overloaded/i.test(msg);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function chatText(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options?: {
    model?: string;
    fallbackModel?: string | null;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<{ text: string; model: string }> {
  const chain = modelChain(
    options?.model ?? PRIMARY_MODEL,
    options?.fallbackModel ?? FALLBACK_MODEL
  );
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    if (i > 0) await sleep(2000 + Math.random() * 4000);
    const modelId = chain[i]!;
    try {
      const result = await generateText({
        model: resolveModel(modelId),
        messages,
        maxOutputTokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.2,
      });
      return { text: result.text, model: modelId };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
    }
  }
  throw lastError;
}

export function chatStream(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options?: {
    model?: string;
    fallbackModel?: string | null;
    maxTokens?: number;
    temperature?: number;
  }
) {
  const modelId = options?.model ?? PRIMARY_MODEL;
  return streamText({
    model: resolveModel(modelId),
    messages,
    maxOutputTokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.2,
  });
}

export function visionModel() {
  return resolveModel(VISION_MODEL);
}
