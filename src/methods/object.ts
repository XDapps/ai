import { generateObject } from "ai"
import type { z } from "zod"
import type { UseCase } from "../types/providers.js"
import type { DefineAIConfig } from "../types/config.js"
import type { AI } from "../types/ai.js"
import { normalizeError, makeError } from "../errors.js"
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

  const { resolved, providerInstance, logSuccess, logFailure } = preamble
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

    // generateObject validates against the schema internally, but its return type
    // is InferSchema<T & ZodType> which TypeScript can't unify with z.infer<T>.
    // safeParse re-narrows to z.infer<T> and routes validation failures to
    // INVALID_RESPONSE rather than letting them escape as UNKNOWN.
    const parsed = opts.schema.safeParse(result.object)
    if (!parsed.success) {
      const err = makeError("INVALID_RESPONSE", parsed.error.message, provider)
      await logFailure(err)
      return { ok: false as const, error: err }
    }

    await logSuccess(result.usage)

    return { ok: true as const, object: parsed.data }
  } catch (err) {
    const error = normalizeError(err, provider)
    await logFailure(error)
    return { ok: false as const, error }
  }
}
