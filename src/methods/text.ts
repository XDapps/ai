import { generateText } from "ai"
import type { UseCase } from "../types/providers.js"
import type { DefineAIConfig } from "../types/config.js"
import type { AI } from "../types/ai.js"
import { normalizeError } from "../errors.js"
import { runCallPreamble } from "../internal/run-call.js"

type TextOpts<U extends Record<string, UseCase>> = Parameters<AI<U>["text"]>[0]
type TextResult<U extends Record<string, UseCase>> = ReturnType<AI<U>["text"]>

export async function text<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
  opts: TextOpts<U>,
): TextResult<U> {
  const startTime = performance.now()
  // opts.use is keyof U which TypeScript widens to string|number|symbol in generic context.
  // The runtime value is always a string (object keys are strings in our config).
  const useKey: string | undefined =
    typeof opts.use === "string" ? opts.use : undefined
  const preamble = await runCallPreamble(
    config,
    { use: useKey, model: opts.model },
    "text",
    startTime,
  )
  if (!preamble.ok) {
    return { ok: false, error: preamble.error }
  }

  const { resolved, providerInstance, logSuccess, logFailure } = preamble
  const { provider, model, profile } = resolved

  const textProfile = profile?.modality === "text" ? profile : undefined
  const system = opts.system ?? textProfile?.system
  const temperature = opts.temperature ?? textProfile?.temperature
  // AI SDK v6 uses maxOutputTokens (not maxTokens) for the generate call.
  const maxOutputTokens = opts.maxTokens ?? textProfile?.maxTokens

  const llmModel = providerInstance.languageModel(model)

  try {
    const result = await generateText({
      model: llmModel,
      messages: opts.messages,
      ...(system !== undefined ? { system } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(opts.tools !== undefined ? { tools: opts.tools } : {}),
    })

    await logSuccess(result.usage)

    const toolCalls =
      result.toolCalls.length > 0 ? result.toolCalls : undefined

    return {
      ok: true,
      text: result.text,
      ...(toolCalls !== undefined ? { toolCalls } : {}),
    }
  } catch (err) {
    const error = normalizeError(err, provider)
    await logFailure(error)
    return { ok: false, error }
  }
}
