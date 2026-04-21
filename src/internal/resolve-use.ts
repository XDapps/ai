import type { Provider, Modality, UseCase } from "../types/index.js"
import type { DefineAIConfig } from "../types/index.js"
import type { LlmResult } from "../types/index.js"
import { makeError } from "../errors.js"

const PROVIDERS = new Set<string>(["anthropic", "openai", "google", "deepseek"])

function isProvider(value: string): value is Provider {
  return PROVIDERS.has(value)
}

export interface Resolved {
  provider: Provider
  model: string
  apiKey: string
  profile: UseCase | undefined
}

interface ResolveArgs {
  use?: string
  model?: string
}

export function resolveUse<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
  args: ResolveArgs,
  modality: Modality,
): LlmResult<Resolved> {
  if (args.use !== undefined) {
    const profile = config.use[args.use]

    if (profile === undefined) {
      return {
        ok: false,
        error: makeError("INVALID_CONFIG", `Unknown use case '${args.use}'.`),
      }
    }

    if (profile.modality !== modality) {
      return {
        ok: false,
        error: makeError(
          "INVALID_CONFIG",
          `Use case '${args.use}' has modality '${profile.modality}' but this method requires '${modality}'.`,
        ),
      }
    }

    const apiKey = config.apiKeys[profile.provider]
    if (apiKey === undefined) {
      return {
        ok: false,
        error: makeError(
          "INVALID_CONFIG",
          `No API key configured for provider '${profile.provider}'.`,
          profile.provider,
        ),
      }
    }

    return {
      ok: true,
      provider: profile.provider,
      model: profile.model,
      apiKey,
      profile,
    }
  }

  if (args.model !== undefined) {
    const colonIndex = args.model.indexOf(":")
    if (colonIndex === -1) {
      return {
        ok: false,
        error: makeError(
          "INVALID_CONFIG",
          `Model escape hatch must be in the format 'provider:modelId', got '${args.model}'.`,
        ),
      }
    }

    const providerPart = args.model.slice(0, colonIndex)
    const modelPart = args.model.slice(colonIndex + 1)

    if (!isProvider(providerPart)) {
      return {
        ok: false,
        error: makeError(
          "INVALID_CONFIG",
          `Unknown provider '${providerPart}'. Must be one of: anthropic, openai, google, deepseek.`,
        ),
      }
    }

    const apiKey = config.apiKeys[providerPart]
    if (apiKey === undefined) {
      return {
        ok: false,
        error: makeError(
          "INVALID_CONFIG",
          `No API key configured for provider '${providerPart}'.`,
          providerPart,
        ),
      }
    }

    return {
      ok: true,
      provider: providerPart,
      model: modelPart,
      apiKey,
      profile: undefined,
    }
  }

  return {
    ok: false,
    error: makeError(
      "INVALID_CONFIG",
      "Either 'use' or 'model' must be provided.",
    ),
  }
}
