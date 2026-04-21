import { describe, it, expect, vi, beforeEach } from "vitest"
import type * as AiModule from "ai"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockEmbedMany, mockEmbeddingModel, mockProviderInstance, mockGetProvider } =
  vi.hoisted(() => {
    const mockEmbeddingModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
    const mockProviderInstance = Object.assign(vi.fn(), {
      languageModel: vi.fn(),
      embeddingModel: mockEmbeddingModel,
      imageModel: vi.fn(),
      specificationVersion: "v3" as const,
    })
    return {
      mockEmbedMany: vi.fn(),
      mockEmbeddingModel,
      mockProviderInstance,
      mockGetProvider: vi.fn().mockResolvedValue({ ok: true, provider: mockProviderInstance }),
    }
  })

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<AiModule>()
  return { ...real, embedMany: mockEmbedMany }
})

vi.mock("../../src/providers/registry.js", () => ({
  getProvider: mockGetProvider,
}))

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

import { embed } from "../../src/methods/embed.js"

const config = {
  use: {
    faqEmbedder: {
      provider: "openai" as const,
      model: "text-embedding-3-small",
      modality: "embed" as const,
    },
  },
  apiKeys: { openai: "sk-openai-test" },
}

beforeEach(() => {
  mockEmbedMany.mockReset()
  mockGetProvider.mockResolvedValue({ ok: true, provider: mockProviderInstance })
})

describe("embed()", () => {
  it("returns ok:true with embeddings array on success", async () => {
    mockEmbedMany.mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
    })

    const result = await embed(config, {
      use: "faqEmbedder",
      values: ["hello", "world"],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.embeddings).toHaveLength(2)
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3])
    }
  })

  it("supports model escape hatch", async () => {
    mockEmbedMany.mockResolvedValue({ embeddings: [[0.1]] })

    const result = await embed(config, {
      model: "openai:text-embedding-3-large",
      values: ["hi"],
    })

    expect(result.ok).toBe(true)
    expect(mockEmbeddingModel).toHaveBeenCalledWith("text-embedding-3-large")
  })

  it("returns ok:false with RATE_LIMITED on 429", async () => {
    const { APICallError } = await import("ai")
    mockEmbedMany.mockRejectedValue(
      new APICallError({
        message: "rate limited",
        url: "https://api.openai.com",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: {},
        responseBody: "",
        isRetryable: true,
      }),
    )

    const result = await embed(config, {
      use: "faqEmbedder",
      values: ["hello"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED")
    }
  })

  it("returns ok:false with AUTH_FAILED on 401", async () => {
    const { APICallError } = await import("ai")
    mockEmbedMany.mockRejectedValue(
      new APICallError({
        message: "unauthorized",
        url: "https://api.openai.com",
        requestBodyValues: {},
        statusCode: 401,
        responseHeaders: {},
        responseBody: "",
        isRetryable: false,
      }),
    )

    const result = await embed(config, {
      use: "faqEmbedder",
      values: ["hello"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_FAILED")
    }
  })

  it("returns ok:false with UNKNOWN for generic throws", async () => {
    mockEmbedMany.mockRejectedValue(new Error("network error"))

    const result = await embed(config, {
      use: "faqEmbedder",
      values: ["hello"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN")
    }
  })

  it("calls onFinish with correct CallLog on success", async () => {
    mockEmbedMany.mockResolvedValue({ embeddings: [[0.1]] })

    const onFinish = vi.fn()
    await embed({ ...config, onFinish }, { use: "faqEmbedder", values: ["test"] })

    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log).toMatchObject({
      provider: "openai",
      model: "text-embedding-3-small",
      modality: "embed",
    })
  })

  it("returns INVALID_CONFIG when modality is wrong", async () => {
    const textConfig = {
      use: {
        chat: { provider: "anthropic" as const, model: "claude", modality: "text" as const },
      },
      apiKeys: { anthropic: "sk-test" },
    }

    const result = await embed(textConfig, {
      // @ts-expect-error intentional: chat has text modality, not embed
      use: "chat",
      values: ["hello"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CONFIG")
    }
  })
})
