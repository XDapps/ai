import { describe, it, expect } from "vitest"
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

})
