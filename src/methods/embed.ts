import { embedMany } from "ai"
import type { UseCase } from "../types/providers.js"
import type { DefineAIConfig } from "../types/config.js"
import type { AI } from "../types/ai.js"
import { normalizeError } from "../errors.js"
import { logCall } from "../internal/log-call.js"
import { runCallPreamble } from "../internal/run-call.js"

type EmbedOpts<U extends Record<string, UseCase>> = Parameters<
  AI<U>["embed"]
>[0]

export async function embed<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
  opts: EmbedOpts<U>,
) {
  const startTime = performance.now()
  const useKey: string | undefined =
    typeof opts.use === "string" ? opts.use : undefined
  const preamble = await runCallPreamble(
    config,
    { use: useKey, model: opts.model },
    "embed",
    startTime,
  )
  if (!preamble.ok) {
    return { ok: false as const, error: preamble.error }
  }

  const { resolved, providerInstance } = preamble
  const { provider, model } = resolved

  // ProviderV3 exposes embeddingModel(); textEmbeddingModel() is deprecated.
  const embeddingModel = providerInstance.embeddingModel(model)

  try {
    const result = await embedMany({
      model: embeddingModel,
      values: opts.values,
    })

    await logCall({
      config,
      use: useKey,
      provider,
      model,
      modality: "embed",
      startTime,
    })

    return { ok: true as const, embeddings: result.embeddings }
  } catch (err) {
    const error = normalizeError(err, provider)
    await logCall({
      config,
      use: useKey,
      provider,
      model,
      modality: "embed",
      startTime,
      error,
    })
    return { ok: false as const, error }
  }
}
