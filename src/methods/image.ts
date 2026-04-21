import { generateImage } from "ai"
import type { UseCase } from "../types/providers.js"
import type { DefineAIConfig } from "../types/config.js"
import type { AI } from "../types/ai.js"
import { normalizeError } from "../errors.js"
import { logCall } from "../internal/log-call.js"
import { runCallPreamble } from "../internal/run-call.js"

type ImageOpts<U extends Record<string, UseCase>> = Parameters<
  AI<U>["image"]
>[0]

// Vercel's generateImage requires size as `${number}x${number}`.
// Our public API accepts string for convenience; narrow here via a type predicate.
function isSizeLiteral(s: string): s is `${number}x${number}` {
  return /^\d+x\d+$/.test(s)
}

function narrowSize(
  size: string | undefined,
): `${number}x${number}` | undefined {
  if (size !== undefined && isSizeLiteral(size)) return size
  return undefined
}

export async function image<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
  opts: ImageOpts<U>,
) {
  const startTime = performance.now()
  const useKey: string | undefined =
    typeof opts.use === "string" ? opts.use : undefined
  const preamble = await runCallPreamble(
    config,
    { use: useKey, model: opts.model },
    "image",
    startTime,
  )
  if (!preamble.ok) {
    return { ok: false as const, error: preamble.error }
  }

  const { resolved, providerInstance } = preamble
  const { provider, model } = resolved

  const imageModel = providerInstance.imageModel(model)

  // generateImage expects size as `${number}x${number}`; our public opts.size is typed
  // as string for convenience. Validate the shape and discard non-conforming values.
  const size = narrowSize(opts.size)

  try {
    const result = await generateImage({
      model: imageModel,
      prompt: opts.prompt,
      ...(opts.n !== undefined ? { n: opts.n } : {}),
      ...(size !== undefined ? { size } : {}),
    })

    await logCall({
      config,
      use: useKey,
      provider,
      model,
      modality: "image",
      startTime,
    })

    const images = result.images.map((img) => ({
      base64: img.base64,
      mediaType: img.mediaType,
    }))

    return { ok: true as const, images }
  } catch (err) {
    const error = normalizeError(err, provider)
    await logCall({
      config,
      use: useKey,
      provider,
      model,
      modality: "image",
      startTime,
      error,
    })
    return { ok: false as const, error }
  }
}
