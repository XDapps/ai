import type { Provider } from "../types/index.js"
import type { LlmResult } from "../types/index.js"
import { makeError } from "../errors.js"
import { loadAnthropic } from "./anthropic.js"
import { loadOpenAI } from "./openai.js"
import { loadGoogle } from "./google.js"
import { loadDeepSeek } from "./deepseek.js"

export type ProviderInstance =
  | Awaited<ReturnType<typeof loadAnthropic>>
  | Awaited<ReturnType<typeof loadOpenAI>>
  | Awaited<ReturnType<typeof loadGoogle>>
  | Awaited<ReturnType<typeof loadDeepSeek>>

// Cache keyed by "provider:apiKey" so different keys get distinct instances.
const cache = new Map<string, ProviderInstance>()

async function load(p: Provider, apiKey: string): Promise<ProviderInstance> {
  switch (p) {
    case "anthropic":
      return loadAnthropic(apiKey)
    case "openai":
      return loadOpenAI(apiKey)
    case "google":
      return loadGoogle(apiKey)
    case "deepseek":
      return loadDeepSeek(apiKey)
  }
}

export async function getProvider(
  p: Provider,
  apiKey: string,
): Promise<LlmResult<{ provider: ProviderInstance }>> {
  const key = `${p}:${apiKey}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    return { ok: true, provider: cached }
  }

  try {
    const instance = await load(p, apiKey)
    cache.set(key, instance)
    return { ok: true, provider: instance }
  } catch {
    return {
      ok: false,
      error: makeError(
        "MISSING_PROVIDER_PKG",
        `Install @ai-sdk/${p} to use the '${p}' provider.`,
        p,
      ),
    }
  }
}
