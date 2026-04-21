import { describe, it, expect, vi } from "vitest"
import { z } from "zod"
import type * as AiModule from "ai"

// ---------------------------------------------------------------------------
// Hoisted mocks — these gate the provider registry so no network calls happen
// ---------------------------------------------------------------------------

const {
  mockGetProvider,
  mockGenerateText,
  mockStreamText,
  mockGenerateObject,
  mockGenerateImage,
  mockEmbedMany,
} = vi.hoisted(() => {
  const mockLanguageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
  const mockEmbeddingModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
  const mockImageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
  const providerInstance = Object.assign(vi.fn(), {
    languageModel: mockLanguageModel,
    embeddingModel: mockEmbeddingModel,
    imageModel: mockImageModel,
    specificationVersion: "v3" as const,
  })
  return {
    mockGetProvider: vi.fn().mockResolvedValue({ ok: true, provider: providerInstance }),
    mockGenerateText: vi.fn(),
    mockStreamText: vi.fn(),
    mockGenerateObject: vi.fn(),
    mockGenerateImage: vi.fn(),
    mockEmbedMany: vi.fn(),
  }
})

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<AiModule>()
  return {
    ...real,
    generateText: mockGenerateText,
    streamText: mockStreamText,
    generateObject: mockGenerateObject,
    generateImage: mockGenerateImage,
    embedMany: mockEmbedMany,
  }
})

vi.mock("../../src/providers/registry.js", () => ({ getProvider: mockGetProvider }))

import { defineAI } from "../../src/index.js"
import { LlmFactoryError } from "../../src/internal/factory-error.js"

const validConfig = {
  use: {
    customerChat: {
      provider: "anthropic" as const,
      model: "claude-haiku-4-5",
      modality: "text" as const,
      temperature: 0.7,
    },
    productImage: {
      provider: "openai" as const,
      model: "gpt-image-1",
      modality: "image" as const,
    },
  },
  apiKeys: {
    anthropic: "sk-ant-test",
    openai: "sk-openai-test",
  },
}

describe("defineAI", () => {
  it("returns an object with all five methods for valid config", () => {
    const ai = defineAI(validConfig)
    expect(typeof ai.text).toBe("function")
    expect(typeof ai.stream).toBe("function")
    expect(typeof ai.object).toBe("function")
    expect(typeof ai.image).toBe("function")
    expect(typeof ai.embed).toBe("function")
  })

  it("throws LlmFactoryError when a use case is missing its API key", () => {
    expect(() =>
      defineAI({
        use: {
          chat: {
            provider: "anthropic" as const,
            model: "claude-haiku-4-5",
            modality: "text" as const,
          },
        },
        apiKeys: {}, // anthropic key missing
      }),
    ).toThrow(LlmFactoryError)
  })

  it("throws LlmFactoryError for an empty model string", () => {
    expect(() =>
      defineAI({
        use: {
          chat: {
            provider: "anthropic" as const,
            model: "",
            modality: "text" as const,
          },
        },
        apiKeys: { anthropic: "sk-ant" },
      }),
    ).toThrow(LlmFactoryError)
  })

  it("LlmFactoryError includes issues array", () => {
    try {
      defineAI({
        use: {
          chat: {
            provider: "anthropic" as const,
            model: "claude",
            modality: "text" as const,
          },
        },
        apiKeys: {},
      })
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(LlmFactoryError)
      if (err instanceof LlmFactoryError) {
        expect(err.issues.length).toBeGreaterThan(0)
      }
    }
  })

  it("ai.text() delegates to text() and returns ok:true", async () => {
    mockGenerateText.mockResolvedValue({
      text: "hello",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    })
    const ai = defineAI(validConfig)
    const result = await ai.text({ use: "customerChat", messages: [{ role: "user", content: "hi" }] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe("hello")
  })

  it("ai.stream() delegates to stream() and returns textStream", async () => {
    async function* chunks() { yield "hi" }
    mockStreamText.mockReturnValue({
      textStream: chunks(),
      fullStream: chunks(),
      toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response("ok")),
    })
    const ai = defineAI(validConfig)
    const result = await ai.stream({ use: "customerChat", messages: [{ role: "user", content: "hi" }] })
    const collected: string[] = []
    for await (const c of result.textStream) collected.push(c)
    expect(collected).toEqual(["hi"])
  })

  it("ai.object() delegates to object() and returns ok:true", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { x: 1 },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    })
    const ai = defineAI(validConfig)
    const result = await ai.object({
      use: "customerChat",
      schema: z.object({ x: z.number() }),
      messages: [{ role: "user", content: "hi" }],
    })
    expect(result.ok).toBe(true)
  })

  it("ai.image() delegates to image() and returns ok:true", async () => {
    mockGenerateImage.mockResolvedValue({
      images: [{ base64: "abc", mediaType: "image/png" }],
    })
    const ai = defineAI(validConfig)
    const result = await ai.image({ use: "productImage", prompt: "a cat" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.images[0]?.base64).toBe("abc")
  })

  it("ai.embed() delegates to embed()", async () => {
    mockEmbedMany.mockResolvedValue({ embeddings: [[0.1, 0.2]] })
    const configWithEmbed = {
      ...validConfig,
      use: {
        ...validConfig.use,
        faqEmbed: { provider: "openai" as const, model: "text-embedding-3-small", modality: "embed" as const },
      },
    }
    const ai = defineAI(configWithEmbed)
    const result = await ai.embed({ use: "faqEmbed", values: ["test"] })
    expect(result.ok).toBe(true)
  })
})
