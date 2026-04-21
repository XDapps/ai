import { describe, it, expect } from "vitest"
import { resolveUse } from "../../src/internal/resolve-use.js"
import type { DefineAIConfig } from "../../src/types/index.js"

const config = {
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
      size: "1024x1024",
    },
    faqEmbedder: {
      provider: "openai" as const,
      model: "text-embedding-3-small",
      modality: "embed" as const,
    },
  },
  apiKeys: {
    anthropic: "sk-ant-test",
    openai: "sk-openai-test",
  },
} satisfies DefineAIConfig<{
  customerChat: { provider: "anthropic"; model: string; modality: "text"; temperature: number }
  productImage: { provider: "openai"; model: string; modality: "image"; size: string }
  faqEmbedder: { provider: "openai"; model: string; modality: "embed" }
}>

describe("resolveUse — use-name path", () => {
  it("resolves a text use case by name", () => {
    const result = resolveUse(config, { use: "customerChat" }, "text")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.provider).toBe("anthropic")
    expect(result.model).toBe("claude-haiku-4-5")
    expect(result.apiKey).toBe("sk-ant-test")
    expect(result.profile).toBeDefined()
    expect(result.profile?.modality).toBe("text")
  })

  it("resolves an image use case by name", () => {
    const result = resolveUse(config, { use: "productImage" }, "image")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.provider).toBe("openai")
    expect(result.model).toBe("gpt-image-1")
  })

  it("returns INVALID_CONFIG for unknown use name", () => {
    const result = resolveUse(config, { use: "nonexistent" }, "text")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("INVALID_CONFIG")
  })

  it("returns INVALID_CONFIG for modality mismatch", () => {
    // 'productImage' is 'image', but we request 'text'
    const result = resolveUse(config, { use: "productImage" }, "text")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("INVALID_CONFIG")
    expect(result.error.message).toContain("modality")
  })
})

describe("resolveUse — escape-hatch model path", () => {
  it("parses 'provider:modelId' escape hatch", () => {
    const result = resolveUse(config, { model: "anthropic:claude-opus-4-7" }, "text")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.provider).toBe("anthropic")
    expect(result.model).toBe("claude-opus-4-7")
    expect(result.apiKey).toBe("sk-ant-test")
    expect(result.profile).toBeUndefined()
  })

  it("handles model IDs with colons correctly", () => {
    const result = resolveUse(config, { model: "openai:gpt-4:turbo" }, "text")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.provider).toBe("openai")
    expect(result.model).toBe("gpt-4:turbo")
  })

  it("returns INVALID_CONFIG for unknown provider in escape hatch", () => {
    const result = resolveUse(config, { model: "azure:gpt-4" }, "text")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("INVALID_CONFIG")
  })

  it("returns INVALID_CONFIG when model string has no colon", () => {
    const result = resolveUse(config, { model: "anthropic-claude" }, "text")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("INVALID_CONFIG")
  })

  it("returns INVALID_CONFIG when escape-hatch provider has no API key", () => {
    const result = resolveUse(config, { model: "deepseek:deepseek-chat" }, "text")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("INVALID_CONFIG")
    expect(result.error.message).toContain("deepseek")
  })
})

describe("resolveUse — missing apiKey for named use case", () => {
  it("returns INVALID_CONFIG when use case provider has no API key", () => {
    const configWithoutGoogle = {
      use: {
        geminiChat: {
          provider: "google" as const,
          model: "gemini-1.5-pro",
          modality: "text" as const,
        },
      },
      apiKeys: {},
    }
    const result = resolveUse(configWithoutGoogle, { use: "geminiChat" }, "text")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("INVALID_CONFIG")
    expect(result.error.provider).toBe("google")
  })
})

describe("resolveUse — neither use nor model provided", () => {
  it("returns INVALID_CONFIG", () => {
    const result = resolveUse(config, {}, "text")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("INVALID_CONFIG")
    expect(result.error.message).toContain("Either")
  })
})
