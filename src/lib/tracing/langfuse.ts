import { Langfuse } from "langfuse";

let client: Langfuse | null = null;

export function tracingEnabled(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
  );
}

export function getLangfuse(): Langfuse | null {
  if (!tracingEnabled()) return null;
  if (!client) {
    client = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com",
    });
  }
  return client;
}

export async function withTrace<T>(
  name: string,
  fn: (trace: { id: string } | null) => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const lf = getLangfuse();
  if (!lf) return fn(null);

  const trace = lf.trace({ name, metadata });
  try {
    const result = await fn({ id: trace.id });
    trace.update({ output: { ok: true } });
    return result;
  } catch (error) {
    trace.update({
      output: { ok: false, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  } finally {
    await lf.flushAsync();
  }
}

export async function flushTracing(): Promise<void> {
  const lf = getLangfuse();
  if (lf) await lf.flushAsync();
}
