import type { Modality, Provider, UseCase } from "./providers.js"
import type { LlmError } from "./errors.js"

export interface DefineAIConfig<U extends Record<string, UseCase>> {
  use: U
  apiKeys: Partial<Record<Provider, string>>
  logger?: {
    info(msg: string, data?: Record<string, unknown>): void
    warn(msg: string, data?: Record<string, unknown>): void
    error(msg: string, data?: Record<string, unknown>): void
  }
  onFinish?: (call: CallLog) => void | Promise<void>
}

export interface CallLog {
  use: string
  provider: Provider
  model: string
  modality: Modality
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  error?: LlmError
}
