export type * from "./types.js"
import type { DefineAIConfig, AI, UseCase } from "./types.js"

export function defineAI<U extends Record<string, UseCase>>(
  _config: DefineAIConfig<U>,
): AI<U> {
  throw new Error("defineAI: not implemented — landing in Phase 2")
}
