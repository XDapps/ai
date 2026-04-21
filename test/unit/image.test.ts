import { describe, it, expect, vi, beforeEach } from "vitest"
import type * as AiModule from "ai"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGenerateImage, mockProviderInstance, mockGetProvider } =
  vi.hoisted(() => {
    const mockImageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
    const mockProviderInstance = Object.assign(vi.fn(), {
      languageModel: vi.fn(),
      embeddingModel: vi.fn(),
      imageModel: mockImageModel,
      specificationVersion: "v3" as const,
    })
    return {
      mockGenerateImage: vi.fn(),
      mockImageModel,
      mockProviderInstance,
      mockGetProvider: vi.fn().mockResolvedValue({ ok: true, provider: mockProviderInstance }),
    }
  })

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<AiModule>()
  return { ...real, generateImage: mockGenerateImage }
})

vi.mock("../../src/providers/registry.js", () => ({
  getProvider: mockGetProvider,
}))

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

import { image } from "../../src/methods/image.js"

const config = {
  use: {
    productImage: {
      provider: "openai" as const,
      model: "gpt-image-1",
      modality: "image" as const,
    },
  },
  apiKeys: { openai: "sk-openai-test" },
}

function makeGeneratedFile(base64: string, mediaType: string) {
  return { base64, mediaType }
}

function makeSdkImageResult(base64 = "abc123", mediaType = "image/png") {
  return {
    images: [makeGeneratedFile(base64, mediaType)],
    image: makeGeneratedFile(base64, mediaType),
    warnings: [],
    responses: [],
    providerMetadata: {},
  }
}

beforeEach(() => {
  mockGenerateImage.mockReset()
  mockGetProvider.mockResolvedValue({ ok: true, provider: mockProviderInstance })
})

describe("image()", () => {
  it("returns ok:true with mapped images on success", async () => {
    mockGenerateImage.mockResolvedValue(makeSdkImageResult())

    const result = await image(config, {
      use: "productImage",
      prompt: "a cat",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.images).toEqual([{ base64: "abc123", mediaType: "image/png" }])
    }
  })

  it("returns ok:false with RATE_LIMITED on 429", async () => {
    const { APICallError } = await import("ai")
    mockGenerateImage.mockRejectedValue(
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

    const result = await image(config, {
      use: "productImage",
      prompt: "a cat",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED")
    }
  })

  it("returns ok:false with AUTH_FAILED on 401", async () => {
    const { APICallError } = await import("ai")
    mockGenerateImage.mockRejectedValue(
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

    const result = await image(config, {
      use: "productImage",
      prompt: "a cat",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_FAILED")
    }
  })

  it("returns ok:false with UNKNOWN for generic throws", async () => {
    mockGenerateImage.mockRejectedValue(new Error("network timeout"))

    const result = await image(config, { use: "productImage", prompt: "a cat" })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN")
    }
  })

  it("calls onFinish with correct CallLog on success", async () => {
    mockGenerateImage.mockResolvedValue(makeSdkImageResult())

    const onFinish = vi.fn()
    await image({ ...config, onFinish }, { use: "productImage", prompt: "a cat" })

    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log).toMatchObject({
      provider: "openai",
      model: "gpt-image-1",
      modality: "image",
    })
  })

  it("returns INVALID_CONFIG when modality is wrong", async () => {
    const textConfig = {
      use: {
        chat: { provider: "anthropic" as const, model: "claude", modality: "text" as const },
      },
      apiKeys: { anthropic: "sk-test" },
    }

    const result = await image(textConfig, {
      // @ts-expect-error intentional: chat has text modality, not image
      use: "chat",
      prompt: "a cat",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CONFIG")
    }
  })
})
