import { streamText } from "ai"
import type { UseCase } from "../types/providers.js"
import type { LlmError } from "../types/errors.js"
import type { DefineAIConfig } from "../types/config.js"
import type { AI, LlmStreamResult } from "../types/ai.js"
import { normalizeError } from "../errors.js"
import { logCall } from "../internal/log-call.js"
import { runCallPreamble } from "../internal/run-call.js"

type StreamOpts<U extends Record<string, UseCase>> = Parameters<
  AI<U>["stream"]
>[0]

// Wraps an LlmError into a stream object that immediately surfaces it.
// This lets callers consume stream() uniformly even for pre-stream failures.
function errorStream(error: LlmError): LlmStreamResult {
  async function* failingIterable(): AsyncGenerator<string> {
    const cause = error
    throw Object.assign(new Error(error.message), { cause })
    // yield is unreachable but TypeScript needs it to infer AsyncGenerator<string>
    yield ""
  }
  return {
    textStream: failingIterable(),
    fullStream: failingIterable(),
    toDataStreamResponse() {
      return new Response(JSON.stringify({ error }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    },
  }
}

export async function stream<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
  opts: StreamOpts<U>,
): Promise<LlmStreamResult> {
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
    return errorStream(preamble.error)
  }

  const { resolved, providerInstance } = preamble
  const { provider, model, profile } = resolved

  const textProfile = profile?.modality === "text" ? profile : undefined
  const system = opts.system ?? textProfile?.system
  const temperature = opts.temperature ?? textProfile?.temperature
  const maxOutputTokens = opts.maxTokens ?? textProfile?.maxTokens

  const llmModel = providerInstance.languageModel(model)

  try {
    const result = streamText({
      model: llmModel,
      messages: opts.messages,
      ...(system !== undefined ? { system } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(opts.tools !== undefined ? { tools: opts.tools } : {}),
      onFinish: ({ usage }) => {
        void logCall({
          config,
          use: useKey,
          provider,
          model,
          modality: "text",
          startTime,
          usage,
        })
      },
    })

    // AI SDK v6 uses toUIMessageStreamResponse() for streaming UI responses.
    // We alias it to toDataStreamResponse() to satisfy our LlmStreamResult interface.
    return {
      textStream: result.textStream,
      fullStream: result.fullStream,
      toDataStreamResponse() {
        return result.toUIMessageStreamResponse()
      },
    }
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
    return errorStream(error)
  }
}
