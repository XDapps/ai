import { describe, it, expect } from "vitest"
import { validateConfig } from "../../src/internal/validate-config.js"
import { LlmFactoryError } from "../../src/internal/factory-error.js"

describe("validateConfig", () => {
  it("accepts a valid config with all modalities", () => {
    expect(() =>
      validateConfig({
        use: {
          chat: { provider: "anthropic", model: "claude-haiku-4-5", modality: "text", temperature: 0.7 },
          img: { provider: "openai", model: "gpt-image-1", modality: "image", size: "512x512" },
          embed: { provider: "openai", model: "text-embedding-3-small", modality: "embed" },
        },
        apiKeys: { anthropic: "sk-ant", openai: "sk-openai" },
      }),
    ).not.toThrow()
  })

  it("throws LlmFactoryError for an invalid provider value", () => {
    expect(() =>
      validateConfig({
        use: {
          // @ts-expect-error intentional invalid provider
          chat: { provider: "azure", model: "gpt-4", modality: "text" },
        },
        apiKeys: {},
      }),
    ).toThrow(LlmFactoryError)
  })

  it("throws LlmFactoryError when multiple use cases are missing API keys", () => {
    try {
      validateConfig({
        use: {
          a: { provider: "anthropic", model: "claude", modality: "text" },
          b: { provider: "openai", model: "gpt-4", modality: "text" },
        },
        apiKeys: {},
      })
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(LlmFactoryError)
      if (err instanceof LlmFactoryError) {
        // Both use cases should report missing keys
        expect(err.issues.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it("accepts optional text use case fields (temperature, maxTokens, system)", () => {
    expect(() =>
      validateConfig({
        use: {
          chat: {
            provider: "anthropic",
            model: "claude-haiku-4-5",
            modality: "text",
            temperature: 1.0,
            maxTokens: 2048,
            system: "You are helpful.",
          },
        },
        apiKeys: { anthropic: "sk-ant" },
      }),
    ).not.toThrow()
  })

  it("accepts optional image use case fields (size, quality)", () => {
    expect(() =>
      validateConfig({
        use: {
          img: { provider: "openai", model: "gpt-image-1", modality: "image", size: "1024x1024", quality: "hd" },
        },
        apiKeys: { openai: "sk-openai" },
      }),
    ).not.toThrow()
  })

  it("throws for negative maxTokens", () => {
    expect(() =>
      validateConfig({
        use: {
          chat: { provider: "anthropic", model: "claude", modality: "text", maxTokens: -1 },
        },
        apiKeys: { anthropic: "sk-ant" },
      }),
    ).toThrow(LlmFactoryError)
  })
})
