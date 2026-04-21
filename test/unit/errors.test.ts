import { describe, it, expect } from "vitest"
import { APICallError, NoObjectGeneratedError, NoContentGeneratedError, InvalidResponseDataError } from "ai"
import { normalizeError, makeError } from "../../src/errors.js"

describe("makeError", () => {
  it("sets retryable=true for RATE_LIMITED", () => {
    expect(makeError("RATE_LIMITED", "msg").retryable).toBe(true)
  })

  it("sets retryable=true for PROVIDER_UNAVAILABLE", () => {
    expect(makeError("PROVIDER_UNAVAILABLE", "msg").retryable).toBe(true)
  })

  it("sets retryable=false for all other codes", () => {
    const nonRetryable = [
      "AUTH_FAILED",
      "CONTEXT_TOO_LONG",
      "CONTENT_FILTERED",
      "INVALID_RESPONSE",
      "INVALID_CONFIG",
      "MISSING_PROVIDER_PKG",
      "UNKNOWN",
    ] as const
    for (const code of nonRetryable) {
      expect(makeError(code, "msg").retryable).toBe(false)
    }
  })

  it("sets provider when given", () => {
    expect(makeError("UNKNOWN", "msg", "anthropic").provider).toBe("anthropic")
  })
})

function makeApiCallError(opts: {
  statusCode?: number
  message?: string
}): APICallError {
  return new APICallError({
    message: opts.message ?? "error",
    url: "https://api.example.com",
    requestBodyValues: {},
    statusCode: opts.statusCode,
    responseHeaders: undefined,
    responseBody: undefined,
    isRetryable: false,
    data: undefined,
  })
}

describe("normalizeError", () => {
  describe("APICallError HTTP status codes", () => {
    it("maps 429 → RATE_LIMITED (retryable)", () => {
      const err = makeApiCallError({ statusCode: 429 })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("RATE_LIMITED")
      expect(result.retryable).toBe(true)
    })

    it("maps 401 → AUTH_FAILED", () => {
      const err = makeApiCallError({ statusCode: 401 })
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("AUTH_FAILED")
      expect(result.retryable).toBe(false)
    })

    it("maps 403 → AUTH_FAILED", () => {
      const err = makeApiCallError({ statusCode: 403 })
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("AUTH_FAILED")
    })

    it("maps 400 with 'context' keyword → CONTEXT_TOO_LONG", () => {
      const err = makeApiCallError({ statusCode: 400, message: "context length exceeded" })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("CONTEXT_TOO_LONG")
    })

    it("maps 400 with 'token' keyword → CONTEXT_TOO_LONG", () => {
      const err = makeApiCallError({ statusCode: 400, message: "max token limit reached" })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("CONTEXT_TOO_LONG")
    })

    it("maps 400 without context/token keyword → UNKNOWN", () => {
      const err = makeApiCallError({ statusCode: 400, message: "bad request" })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("UNKNOWN")
    })

    it("maps 500 → PROVIDER_UNAVAILABLE (retryable)", () => {
      const err = makeApiCallError({ statusCode: 500 })
      const result = normalizeError(err, "google")
      expect(result.code).toBe("PROVIDER_UNAVAILABLE")
      expect(result.retryable).toBe(true)
    })

    it("maps 503 → PROVIDER_UNAVAILABLE (retryable)", () => {
      const err = makeApiCallError({ statusCode: 503 })
      const result = normalizeError(err, "google")
      expect(result.code).toBe("PROVIDER_UNAVAILABLE")
      expect(result.retryable).toBe(true)
    })

    it("maps unknown status → UNKNOWN", () => {
      const err = makeApiCallError({ statusCode: 404 })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("UNKNOWN")
    })
  })

  describe("content filter detection", () => {
    it("detects 'content_policy' in message → CONTENT_FILTERED", () => {
      const err = makeApiCallError({ message: "Request blocked by content_policy." })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("CONTENT_FILTERED")
    })

    it("detects 'safety_filter' in message → CONTENT_FILTERED", () => {
      const err = new Error("Response blocked by safety_filter.")
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("CONTENT_FILTERED")
    })

    it("detects 'content_filter' in message → CONTENT_FILTERED", () => {
      const err = new Error("Output was blocked by content_filter.")
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("CONTENT_FILTERED")
    })

    it("APICallError 429 with 'safety' in message → RATE_LIMITED (not CONTENT_FILTERED)", () => {
      // Ordering-bug regression: status-code classification must win over content-filter check.
      const err = makeApiCallError({ statusCode: 429, message: "rate limited for platform safety" })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("RATE_LIMITED")
      expect(result.retryable).toBe(true)
    })

    it("APICallError 400 with 'content_policy' (no context/token keyword) → CONTENT_FILTERED", () => {
      const err = makeApiCallError({ statusCode: 400, message: "Request violates content_policy." })
      const result = normalizeError(err, "openai")
      expect(result.code).toBe("CONTENT_FILTERED")
    })
  })

  describe("Vercel SDK error class detection", () => {
    it("maps AI_RateLimitError by name → RATE_LIMITED", () => {
      const err = Object.assign(new Error("rate limit hit"), {
        name: "AI_RateLimitError",
      })
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("RATE_LIMITED")
      expect(result.retryable).toBe(true)
    })

    it("maps InvalidResponseDataError → INVALID_RESPONSE", () => {
      const err = new InvalidResponseDataError({ message: "bad data", response: "x" })
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("INVALID_RESPONSE")
    })

    it("maps NoObjectGeneratedError → INVALID_RESPONSE", () => {
      const err = new NoObjectGeneratedError({
        message: "no object",
        response: {
          id: "r1",
          timestamp: new Date(),
          modelId: "claude",
          headers: undefined,
          body: undefined,
        },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 },
        finishReason: "error",
        warnings: [],
      })
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("INVALID_RESPONSE")
    })

    it("maps NoContentGeneratedError → INVALID_RESPONSE", () => {
      const err = new NoContentGeneratedError({
        message: "no content",
        response: {
          id: "r1",
          timestamp: new Date(),
          modelId: "claude",
          headers: undefined,
          body: undefined,
        },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 },
        finishReason: "stop",
        warnings: [],
      })
      const result = normalizeError(err, "anthropic")
      expect(result.code).toBe("INVALID_RESPONSE")
    })
  })

  describe("unknown/non-Error values", () => {
    it("maps plain Error with no matching condition → UNKNOWN", () => {
      const result = normalizeError(new Error("something weird"), "deepseek")
      expect(result.code).toBe("UNKNOWN")
    })

    it("maps string throw → UNKNOWN", () => {
      const result = normalizeError("something went wrong", "openai")
      expect(result.code).toBe("UNKNOWN")
      expect(result.message).toBe("something went wrong")
    })

    it("maps non-string/non-Error → UNKNOWN with fallback message", () => {
      const result = normalizeError(42, "openai")
      expect(result.code).toBe("UNKNOWN")
    })

    it("sets provider on result", () => {
      const result = normalizeError(new Error("x"), "deepseek")
      expect(result.provider).toBe("deepseek")
    })
  })
})
