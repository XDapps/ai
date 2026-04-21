import { describe, it, expect, vi, beforeEach } from "vitest"
import type { LanguageModelUsage } from "ai"
import type * as AiModule from "ai"

// ---------------------------------------------------------------------------
// Hoisted mock vars — must use vi.hoisted so they're available inside vi.mock
// ---------------------------------------------------------------------------

const { mockGenerateText, mockLanguageModel, mockProviderInstance, mockGetProvider } =
  vi.hoisted(() => {
    const mockLanguageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
    const mockProviderInstance = Object.assign(vi.fn(), {
      languageModel: mockLanguageModel,
      embeddingModel: vi.fn(),
      imageModel: vi.fn(),
      specificationVersion: "v3" as const,
    })
    return {
      mockGenerateText: vi.fn(),
      mockLanguageModel,
      mockProviderInstance,
      mockGetProvider: vi.fn().mockResolvedValue({ ok: true, provider: mockProviderInstance }),
    }
  })

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<AiModule>()
  return { ...real, generateText: mockGenerateText }
})

vi.mock("../../src/providers/registry.js", () => ({
  getProvider: mockGetProvider,
}))

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { text } from "../../src/methods/text.js"

const config = {
  use: {
    chat: {
      provider: "anthropic" as const,
      model: "claude-haiku-4-5",
      modality: "text" as const,
      temperature: 0.5,
    },
  },
  apiKeys: { anthropic: "sk-ant-test" },
}

function makeUsage(input: number, output: number): LanguageModelUsage {
  return { inputTokens: input, outputTokens: output, totalTokens: input + output }
}

beforeEach(() => {
  mockGenerateText.mockReset()
  mockLanguageModel.mockClear()
  mockGetProvider.mockResolvedValue({ ok: true, provider: mockProviderInstance })
})

describe("text()", () => {
  it("returns ok:true with text and no toolCalls on success", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Hello!",
      toolCalls: [],
      usage: makeUsage(10, 20),
    })

    const result = await text(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe("Hello!")
      expect(result.toolCalls).toBeUndefined()
    }
  })

  it("passes toolCalls through when non-empty", async () => {
    const tc = [{ toolCallId: "1", toolName: "search", input: {} }]
    mockGenerateText.mockResolvedValue({
      text: "",
      toolCalls: tc,
      usage: makeUsage(5, 5),
    })

    const result = await text(config, {
      use: "chat",
      messages: [{ role: "user", content: "search something" }],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.toolCalls).toEqual(tc)
    }
  })

  it("merges call-site opts over profile defaults", async () => {
    mockGenerateText.mockResolvedValue({
      text: "ok",
      toolCalls: [],
      usage: makeUsage(1, 1),
    })

    await text(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
      system: "override system",
      temperature: 0.9,
    })

    const callArgs = mockGenerateText.mock.calls[0]?.[0]
    expect(callArgs?.system).toBe("override system")
    expect(callArgs?.temperature).toBe(0.9)
  })

  it("falls back to profile temperature when call-site omits it", async () => {
    mockGenerateText.mockResolvedValue({
      text: "ok",
      toolCalls: [],
      usage: makeUsage(1, 1),
    })

    await text(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    const callArgs = mockGenerateText.mock.calls[0]?.[0]
    expect(callArgs?.temperature).toBe(0.5) // from profile
  })

  it("returns ok:false with RATE_LIMITED error on 429", async () => {
    const { APICallError } = await import("ai")
    const rateLimitErr = new APICallError({
      message: "rate limited",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: {},
      responseBody: "",
      isRetryable: true,
    })
    mockGenerateText.mockRejectedValue(rateLimitErr)

    const result = await text(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED")
    }
  })

  it("returns ok:false with AUTH_FAILED on 401", async () => {
    const { APICallError } = await import("ai")
    const authErr = new APICallError({
      message: "unauthorized",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 401,
      responseHeaders: {},
      responseBody: "",
      isRetryable: false,
    })
    mockGenerateText.mockRejectedValue(authErr)

    const result = await text(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_FAILED")
    }
  })

  it("returns ok:false with UNKNOWN error for generic throws", async () => {
    mockGenerateText.mockRejectedValue(new Error("network error"))

    const result = await text(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN")
    }
  })

  it("calls onFinish with correct CallLog shape on success", async () => {
    mockGenerateText.mockResolvedValue({
      text: "hi",
      toolCalls: [],
      usage: makeUsage(3, 7),
    })

    const onFinish = vi.fn()
    await text({ ...config, onFinish }, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      modality: "text",
      inputTokens: 3,
      outputTokens: 7,
    })
  })

  it("returns INVALID_CONFIG when use is unknown", async () => {
    const result = await text(config, {
      // @ts-expect-error intentional unknown use key for test
      use: "nonexistent",
      messages: [{ role: "user", content: "hi" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CONFIG")
    }
  })
})
