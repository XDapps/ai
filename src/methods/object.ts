import { generateObject } from "ai"
import type { z } from "zod"
import type { UseCase } from "../types/providers.js"
import type { DefineAIConfig } from "../types/config.js"
import type { AI } from "../types/ai.js"
import { normalizeError } from "../errors.js"
import { logCall } from "../internal/log-call.js"
import { runCallPreamble } from "../internal/run-call.js"

type ObjectOpts<
  U extends Record<string, UseCase>,
  T extends z.ZodType,
> = Parameters<AI<U>["object"]>[0] & { schema: T }

export async function object<
  U extends Record<string, UseCase>,
  T extends z.ZodType,
>(
  config: DefineAIConfig<U>,
  opts: ObjectOpts<U, T>,
) {
  const startTime = performance.now()
  const useKey: string | undefined =
    typeof opts.use === "string" ? opts.use : undefined
  const preamble = await runCallPreamble(
    config,
    { use: useKey, model: opts.model },
    "text",
    startTime,
  )
  if (!preamble.ok) {
    return { ok: false as const, error: preamble.error }
  }

  const { resolved, providerInstance } = preamble
  const { provider, model, profile } = resolved

  const textProfile = profile?.modality === "text" ? profile : undefined
  const system = opts.system ?? textProfile?.system

  const llmModel = providerInstance.languageModel(model)

  try {
    const result = await generateObject({
      model: llmModel,
      schema: opts.schema,
      messages: opts.messages,
      ...(system !== undefined ? { system } : {}),
    })

    await logCall({
      config,
      use: useKey,
      provider,
      model,
      modality: "text",
      startTime,
      usage: result.usage,
    })

    // Parse through the schema to get a z.infer<T>-typed value.
    // generateObject already validated the structure; this call re-narrows the type
    // so TypeScript sees z.infer<T> rather than AI SDK's conditional InferSchema<T>.
    const parsed: z.infer<T> = opts.schema.parse(result.object)
    return { ok: true as const, object: parsed }
  } catch (err) {
    const error = normalizeError(err, provider)
    await logCall({
      config,
      use: useKey,
      provider,
      model,
      modality: "text",
      startTime,
      error,
    })
    return { ok: false as const, error }
  }
}
