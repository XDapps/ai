import type { UseCase, AI } from "./types/index.js"
import type { DefineAIConfig } from "./types/index.js"
import { validateConfig } from "./internal/validate-config.js"
import { text } from "./methods/text.js"
import { stream } from "./methods/stream.js"
import { object } from "./methods/object.js"
import { image } from "./methods/image.js"
import { embed } from "./methods/embed.js"

export function defineAI<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
): AI<U> {
  validateConfig(config)

  return {
    text: (opts) => text(config, opts),
    stream: (opts) => stream(config, opts),
    object: (opts) => object(config, opts),
    image: (opts) => image(config, opts),
    embed: (opts) => embed(config, opts),
  }
}
