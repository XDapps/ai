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
const cache = new Map<string, Promise<ProviderInstance>>()

function isModuleNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")
  )
}

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
  let promise = cache.get(key)

  if (promise === undefined) {
    // Insert the in-flight promise immediately so concurrent callers share it.
    promise = load(p, apiKey)
    cache.set(key, promise)
    // Remove the entry on failure so a later retry can try again.
    promise.catch(() => { cache.delete(key) })
  }

  try {
    const instance = await promise
    return { ok: true, provider: instance }
  } catch (err) {
    if (isModuleNotFoundError(err)) {
      return {
        ok: false,
        error: makeError(
          "MISSING_PROVIDER_PKG",
          `Install @ai-sdk/${p} to use the '${p}' provider.`,
          p,
        ),
      }
    }
    const errMessage = err instanceof Error ? err.message : String(err)
    return { ok: false, error: makeError("UNKNOWN", errMessage, p) }
  }
}
