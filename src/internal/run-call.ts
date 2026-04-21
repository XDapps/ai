import type { UseCase, Modality, Provider } from "../types/providers.js"
import type { LlmResult } from "../types/errors.js"
import type { DefineAIConfig } from "../types/config.js"
import type { Resolved } from "./resolve-use.js"
import type { ProviderInstance } from "../providers/registry.js"
import { resolveUse } from "./resolve-use.js"
import { getProvider } from "../providers/registry.js"
import { logCall } from "./log-call.js"

export interface RunCallReady {
  resolved: Resolved
  providerInstance: ProviderInstance
}

// Attempts to extract a Provider from a "provider:model" string.
// Returns undefined when the string isn't in that format or provider is unrecognised.
function parseProvider(model: string | undefined): Provider | undefined {
  if (model === undefined) return undefined
  const colon = model.indexOf(":")
  if (colon === -1) return undefined
  const candidate = model.slice(0, colon)
  if (
    candidate === "anthropic" ||
    candidate === "openai" ||
    candidate === "google" ||
    candidate === "deepseek"
  ) {
    return candidate
  }
  return undefined
}

// Shared preamble for all methods: resolve routing → load provider instance.
// Logs failures when enough context is available and always returns an LlmResult.
export async function runCallPreamble<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
  args: { use?: string; model?: string },
  modality: Modality,
  startTime: number,
): Promise<LlmResult<RunCallReady>> {
  const resolved = resolveUse(config, args, modality)
  if (!resolved.ok) {
    // Log only when we can identify a provider; INVALID_CONFIG errors with no
    // provider hint are config-time problems, not runtime provider errors.
    const provider =
      resolved.error.provider ?? parseProvider(args.model)
    if (provider !== undefined) {
      await logCall({
        config,
        use: args.use,
        provider,
        model: args.model ?? args.use ?? "unknown",
        modality,
        startTime,
        error: resolved.error,
      })
    }
    return { ok: false, error: resolved.error }
  }

  const providerResult = await getProvider(resolved.provider, resolved.apiKey)
  if (!providerResult.ok) {
    await logCall({
      config,
      use: args.use,
      provider: resolved.provider,
      model: resolved.model,
      modality,
      startTime,
      error: providerResult.error,
    })
    return { ok: false, error: providerResult.error }
  }

  return {
    ok: true,
    resolved,
    providerInstance: providerResult.provider,
  }
}
