import { APICallError, NoObjectGeneratedError, NoContentGeneratedError, InvalidResponseDataError } from "ai"
import type { Provider } from "./types/index.js"
import type { LlmError, LlmErrorCode } from "./types/index.js"

export function makeError(
  code: LlmErrorCode,
  message: string,
  provider?: Provider,
): LlmError {
  return {
    code,
    message,
    provider,
    retryable: code === "RATE_LIMITED" || code === "PROVIDER_UNAVAILABLE",
  }
}

function isContentFiltered(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("content_policy") ||
    lower.includes("safety") ||
    lower.includes("filtered")
  )
}

function isContextTooLong(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes("context") || lower.includes("token")
}

function normalizeApiCallError(err: APICallError, provider: Provider): LlmError {
  const msg = err.message

  if (isContentFiltered(msg)) {
    return makeError("CONTENT_FILTERED", msg, provider)
  }

  const status = err.statusCode

  if (status === 429) {
    return makeError("RATE_LIMITED", msg, provider)
  }
  if (status === 401 || status === 403) {
    return makeError("AUTH_FAILED", msg, provider)
  }
  if (status === 400 && isContextTooLong(msg)) {
    return makeError("CONTEXT_TOO_LONG", msg, provider)
  }
  if (status !== undefined && status >= 500 && status < 600) {
    return makeError("PROVIDER_UNAVAILABLE", msg, provider)
  }

  return makeError("UNKNOWN", msg, provider)
}

export function normalizeError(err: unknown, provider: Provider): LlmError {
  if (!(err instanceof Error)) {
    const message = typeof err === "string" ? err : "An unknown error occurred"
    return makeError("UNKNOWN", message, provider)
  }

  const message = err.message

  if (isContentFiltered(message)) {
    return makeError("CONTENT_FILTERED", message, provider)
  }

  // Use the SDK's own isInstance guards — stable across bundler boundaries.
  if (APICallError.isInstance(err)) {
    return normalizeApiCallError(err, provider)
  }

  // name-based checks for errors without exported isInstance helpers
  const { name } = err

  if (name === "AI_RateLimitError") {
    return makeError("RATE_LIMITED", message, provider)
  }
  if (
    InvalidResponseDataError.isInstance(err) ||
    name === "AI_InvalidResponseDataError"
  ) {
    return makeError("INVALID_RESPONSE", message, provider)
  }
  if (
    NoObjectGeneratedError.isInstance(err) ||
    name === "AI_NoObjectGeneratedError"
  ) {
    return makeError("INVALID_RESPONSE", message, provider)
  }
  if (
    NoContentGeneratedError.isInstance(err) ||
    name === "AI_NoContentGeneratedError"
  ) {
    return makeError("INVALID_RESPONSE", message, provider)
  }

  return makeError("UNKNOWN", message, provider)
}
