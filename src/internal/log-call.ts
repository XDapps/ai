import type { LanguageModelUsage } from "ai"
import type { DefineAIConfig } from "../types/config.js"
import type { UseCase, Provider, Modality } from "../types/providers.js"
import type { LlmError } from "../types/errors.js"
import type { CallLog } from "../types/config.js"

interface LogCallArgs<U extends Record<string, UseCase>> {
  config: DefineAIConfig<U>
  use: string | undefined
  provider: Provider
  model: string
  modality: Modality
  startTime: number
  usage?: LanguageModelUsage
  error?: LlmError
}

export async function logCall<U extends Record<string, UseCase>>(
  args: LogCallArgs<U>,
): Promise<void> {
  const { config, use, provider, model, modality, startTime, usage, error } =
    args

  const durationMs = Math.round(performance.now() - startTime)

  const log: CallLog = {
    use: use ?? model,
    provider,
    model,
    modality,
    durationMs,
    ...(usage?.inputTokens !== undefined
      ? { inputTokens: usage.inputTokens }
      : {}),
    ...(usage?.outputTokens !== undefined
      ? { outputTokens: usage.outputTokens }
      : {}),
    ...(error !== undefined ? { error } : {}),
  }

  // Spread into a plain record so the logger's `Record<string, unknown>` param is satisfied
  // without a cast — CallLog's values are all serialisable primitives.
  const logData: Record<string, unknown> = { ...log }

  try {
    if (config.logger) {
      if (error !== undefined) {
        config.logger.warn("llm.call.error", logData)
      } else {
        config.logger.info("llm.call", logData)
      }
    }

    if (config.onFinish) {
      const result = config.onFinish(log)
      if (result instanceof Promise) {
        await result
      }
    }
  } catch (dispatchErr) {
    // Swallow — logging/callback errors must never propagate to the caller.
    // Wrap the error dispatch itself in a second try/catch so a broken logger
    // cannot escape this function either (hard "never throws" guarantee).
    try {
      config.logger?.error?.("llm.log.dispatch.error", {
        message:
          dispatchErr instanceof Error
            ? dispatchErr.message
            : String(dispatchErr),
      })
    } catch {
      // intentionally swallowed — error logger itself threw
    }
  }
}
