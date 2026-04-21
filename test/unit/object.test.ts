import { describe, it, expect, vi, beforeEach } from "vitest"
import { z } from "zod"
import type { LanguageModelUsage } from "ai"
import type * as AiModule from "ai"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGenerateObject, mockProviderInstance, mockGetProvider } =
  vi.hoisted(() => {
    const mockLanguageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
    const mockProviderInstance = Object.assign(vi.fn(), {
      languageModel: mockLanguageModel,
      embeddingModel: vi.fn(),
      imageModel: vi.fn(),
      specificationVersion: "v3" as const,
    })
    return {
      mockGenerateObject: vi.fn(),
      mockLanguageModel,
      mockProviderInstance,
      mockGetProvider: vi.fn().mockResolvedValue({ ok: true, provider: mockProviderInstance }),
    }
  })

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<AiModule>()
  return { ...real, generateObject: mockGenerateObject }
})

vi.mock("../../src/providers/registry.js", () => ({
  getProvider: mockGetProvider,
}))

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

import { object } from "../../src/methods/object.js"

const config = {
  use: {
    chat: {
      provider: "anthropic" as const,
      model: "claude-haiku-4-5",
      modality: "text" as const,
    },
  },
  apiKeys: { anthropic: "sk-ant-test" },
}

const personSchema = z.object({ name: z.string(), age: z.number() })

function makeUsage(i: number, o: number): LanguageModelUsage {
  return { inputTokens: i, outputTokens: o, totalTokens: i + o }
}

beforeEach(() => {
  mockGenerateObject.mockReset()
  mockGetProvider.mockResolvedValue({ ok: true, provider: mockProviderInstance })
})

describe("object()", () => {
  it("returns ok:true with the parsed object on success", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { name: "Alice", age: 30 },
      usage: makeUsage(5, 10),
    })

    const result = await object(config, {
      use: "chat",
      schema: personSchema,
      messages: [{ role: "user", content: "give me a person" }],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.object).toEqual({ name: "Alice", age: 30 })
    }
  })

  it("returns ok:false with RATE_LIMITED on 429", async () => {
    const { APICallError } = await import("ai")
    mockGenerateObject.mockRejectedValue(
      new APICallError({
        message: "rate limited",
        url: "https://api.anthropic.com",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: {},
        responseBody: "",
        isRetryable: true,
      }),
    )

    const result = await object(config, {
      use: "chat",
      schema: personSchema,
      messages: [{ role: "user", content: "give me a person" }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED")
    }
  })

  it("returns ok:false with UNKNOWN error for generic throws", async () => {
    mockGenerateObject.mockRejectedValue(new Error("unknown"))

    const result = await object(config, {
      use: "chat",
      schema: personSchema,
      messages: [{ role: "user", content: "hi" }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN")
    }
  })

  it("calls onFinish with correct CallLog on success", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { name: "Bob", age: 25 },
      usage: makeUsage(4, 8),
    })

    const onFinish = vi.fn()
    await object({ ...config, onFinish }, {
      use: "chat",
      schema: personSchema,
      messages: [{ role: "user", content: "person" }],
    })

    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      modality: "text",
      inputTokens: 4,
      outputTokens: 8,
    })
  })

  it("returns INVALID_CONFIG when use is unknown", async () => {
    const result = await object(config, {
      // @ts-expect-error intentional bad use key
      use: "nonexistent",
      schema: personSchema,
      messages: [{ role: "user", content: "hi" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CONFIG")
    }
  })
})
