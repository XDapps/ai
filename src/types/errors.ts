import type { Provider } from "./providers.js"

export type LlmErrorCode =
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "CONTEXT_TOO_LONG"
  | "CONTENT_FILTERED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "INVALID_CONFIG" // e.g., use name not in config, missing API key
  | "MISSING_PROVIDER_PKG" // @ai-sdk/anthropic not installed
  | "UNKNOWN"

export interface LlmError {
  code: LlmErrorCode
  message: string
  provider?: Provider
  retryable: boolean // true for RATE_LIMITED, PROVIDER_UNAVAILABLE
}

export type LlmResult<T> = ({ ok: true } & T) | { ok: false; error: LlmError }
