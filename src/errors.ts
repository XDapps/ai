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
    lower.includes("content policy") ||
    lower.includes("content_filter") ||
    lower.includes("content filter") ||
    lower.includes("safety_filter") ||
    lower.includes("safety filter") ||
    lower.includes("blocked by safety")
  )
}

function isContextTooLong(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes("context") || lower.includes("token")
}

function normalizeApiCallError(err: APICallError, provider: Provider): LlmError {
  const msg = err.message
  const status = err.statusCode

  // Status-code classification wins; content-filter is the fallback for 400/undefined.
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
  if (isContentFiltered(msg)) {
    return makeError("CONTENT_FILTERED", msg, provider)
  }

  return makeError("UNKNOWN", msg, provider)
}

export function normalizeError(err: unknown, provider: Provider): LlmError {
  if (!(err instanceof Error)) {
    const message = typeof err === "string" ? err : "An unknown error occurred"
    return makeError("UNKNOWN", message, provider)
  }

  const message = err.message

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

  // Content-filter fallback: only reached for unclassified errors after all specific checks.
  if (isContentFiltered(message)) {
    return makeError("CONTENT_FILTERED", message, provider)
  }

  return makeError("UNKNOWN", message, provider)
}
