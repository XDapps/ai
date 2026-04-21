import type { UseCase, AI } from "./types/index.js"
import type { DefineAIConfig } from "./types/index.js"
import { validateConfig } from "./internal/validate-config.js"

export function defineAI<U extends Record<string, UseCase>>(
  config: DefineAIConfig<U>,
): AI<U> {
  validateConfig(config)

  const ai: AI<U> = {
    text() {
      throw new Error("not implemented — Phase 3")
    },
    stream() {
      throw new Error("not implemented — Phase 3")
    },
    object() {
      throw new Error("not implemented — Phase 3")
    },
    image() {
      throw new Error("not implemented — Phase 3")
    },
    embed() {
      throw new Error("not implemented — Phase 3")
    },
  }

  return ai
}
