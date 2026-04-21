import { describe, it, expect, vi, beforeEach } from "vitest"
import type * as AiModule from "ai"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGetProvider, mockProviderInstance } = vi.hoisted(() => {
  const languageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
  const mockProviderInstance = Object.assign(vi.fn(), {
    languageModel,
    embeddingModel: vi.fn(),
    imageModel: vi.fn(),
    specificationVersion: "v3" as const,
  })
  return {
    mockGetProvider: vi.fn().mockResolvedValue({ ok: true, provider: mockProviderInstance }),
    mockProviderInstance,
  }
})

const { mockGenerateText } = vi.hoisted(() => ({ mockGenerateText: vi.fn() }))

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<AiModule>()
  return { ...real, generateText: mockGenerateText }
})

vi.mock("../../src/providers/registry.js", () => ({
  getProvider: mockGetProvider,
}))

// ---------------------------------------------------------------------------
// Subject (tested indirectly through text() which calls runCallPreamble)
// ---------------------------------------------------------------------------

import { text } from "../../src/methods/text.js"
import { runCallPreamble } from "../../src/internal/run-call.js"
import { makeError } from "../../src/errors.js"

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

beforeEach(() => {
  mockGenerateText.mockReset()
  mockGetProvider.mockResolvedValue({ ok: true, provider: mockProviderInstance })
})

describe("runCallPreamble — provider load failure", () => {
  it("returns MISSING_PROVIDER_PKG and calls onFinish when provider load fails", async () => {
    const onFinish = vi.fn()
    mockGetProvider.mockResolvedValue({
      ok: false,
      error: makeError("MISSING_PROVIDER_PKG", "install @ai-sdk/anthropic", "anthropic"),
    })

    const result = await text({ ...config, onFinish }, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_PROVIDER_PKG")
    }
    // logCall is fired because provider is known (from resolveUse result)
    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log.error?.code).toBe("MISSING_PROVIDER_PKG")
  })
})

describe("runCallPreamble — escape-hatch model with provider in error path", () => {
  it("logs with provider when escape-hatch model string has a known provider prefix", async () => {
    // Use a config with no use cases — force the escape-hatch path.
    const escapeConfig = {
      use: {},
      apiKeys: { openai: "sk-openai-test" },
      onFinish: vi.fn(),
    }

    mockGenerateText.mockResolvedValue({
      text: "ok",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    })

    // This resolves ok (escape hatch path), so logSuccess fires with openai provider.
    const result = await text(escapeConfig, {
      model: "openai:gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(result.ok).toBe(true)
    expect(escapeConfig.onFinish).toHaveBeenCalledOnce()
    const log = escapeConfig.onFinish.mock.calls[0]?.[0]
    expect(log.provider).toBe("openai")
    expect(log.model).toBe("gpt-4o")
  })

  it("does NOT log when escape-hatch provider is unknown (no provider to attach to log)", async () => {
    const escapeConfig = {
      use: {},
      apiKeys: {},
      onFinish: vi.fn(),
    }

    // Call runCallPreamble directly; its `model` arg is plain `string`, so we
    // can pass an unknown-prefix value without fighting the public method's
    // `${Provider}:${string}` template type.
    const result = await runCallPreamble(
      escapeConfig,
      { model: "azure:gpt-4" },
      "text",
      performance.now(),
    )

    expect(result.ok).toBe(false)
    // onFinish should NOT be called when no provider can be identified
    expect(escapeConfig.onFinish).not.toHaveBeenCalled()
  })
})
