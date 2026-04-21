import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports that use them.
// ---------------------------------------------------------------------------

const { mockCreateAnthropic, mockCreateOpenAI, mockCreateGoogleGenerativeAI, mockCreateDeepSeek } =
  vi.hoisted(() => {
    const providerFactory = () => ({
      languageModel: vi.fn().mockReturnValue({ specificationVersion: "v3" }),
      embeddingModel: vi.fn().mockReturnValue({ specificationVersion: "v3" }),
      imageModel: vi.fn().mockReturnValue({ specificationVersion: "v3" }),
      specificationVersion: "v3" as const,
    })
    return {
      mockCreateAnthropic: vi.fn().mockImplementation(providerFactory),
      mockCreateOpenAI: vi.fn().mockImplementation(providerFactory),
      mockCreateGoogleGenerativeAI: vi.fn().mockImplementation(providerFactory),
      mockCreateDeepSeek: vi.fn().mockImplementation(providerFactory),
    }
  })

vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: mockCreateAnthropic }))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mockCreateOpenAI }))
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: mockCreateGoogleGenerativeAI }))
vi.mock("@ai-sdk/deepseek", () => ({ createDeepSeek: mockCreateDeepSeek }))

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

import { getProvider } from "../../src/providers/registry.js"

// Clear the module-level cache between tests by re-importing registry after each test.
// Since Vitest caches modules, we use the vi.resetModules approach.
beforeEach(() => {
  vi.resetModules()
  mockCreateAnthropic.mockClear()
  mockCreateOpenAI.mockClear()
  mockCreateGoogleGenerativeAI.mockClear()
  mockCreateDeepSeek.mockClear()
})

describe("getProvider — successful loads", () => {
  it("loads the anthropic provider", async () => {
    const result = await getProvider("anthropic", "sk-ant-test")
    expect(result.ok).toBe(true)
    expect(mockCreateAnthropic).toHaveBeenCalledWith({ apiKey: "sk-ant-test" })
  })

  it("loads the openai provider", async () => {
    const result = await getProvider("openai", "sk-openai-test")
    expect(result.ok).toBe(true)
    expect(mockCreateOpenAI).toHaveBeenCalledWith({ apiKey: "sk-openai-test" })
  })

  it("loads the google provider", async () => {
    const result = await getProvider("google", "gai-test")
    expect(result.ok).toBe(true)
    expect(mockCreateGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "gai-test" })
  })

  it("loads the deepseek provider", async () => {
    const result = await getProvider("deepseek", "sk-ds-test")
    expect(result.ok).toBe(true)
    expect(mockCreateDeepSeek).toHaveBeenCalledWith({ apiKey: "sk-ds-test" })
  })
})

describe("getProvider — MISSING_PROVIDER_PKG", () => {
  it("returns MISSING_PROVIDER_PKG when the package import fails with ERR_MODULE_NOT_FOUND", async () => {
    mockCreateAnthropic.mockImplementationOnce(() => {
      throw Object.assign(new Error("Cannot find package '@ai-sdk/anthropic'"), {
        code: "ERR_MODULE_NOT_FOUND",
      })
    })

    // Re-import the registry to get a fresh cache after vi.resetModules().
    const { getProvider: freshGetProvider } = await import("../../src/providers/registry.js")
    const result = await freshGetProvider("anthropic", "sk-ant-test")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_PROVIDER_PKG")
      expect(result.error.message).toContain("@ai-sdk/anthropic")
      expect(result.error.provider).toBe("anthropic")
    }
  })

  it("returns MISSING_PROVIDER_PKG on MODULE_NOT_FOUND (CommonJS variant)", async () => {
    mockCreateOpenAI.mockImplementationOnce(() => {
      throw Object.assign(new Error("Cannot find module '@ai-sdk/openai'"), {
        code: "MODULE_NOT_FOUND",
      })
    })

    const { getProvider: freshGetProvider } = await import("../../src/providers/registry.js")
    const result = await freshGetProvider("openai", "sk-openai-test")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_PROVIDER_PKG")
    }
  })
})

describe("getProvider — generic errors", () => {
  it("returns UNKNOWN for non-module-not-found errors", async () => {
    mockCreateAnthropic.mockImplementationOnce(() => {
      throw new Error("Network failure during dynamic import")
    })

    const { getProvider: freshGetProvider } = await import("../../src/providers/registry.js")
    const result = await freshGetProvider("anthropic", "sk-ant-test")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN")
      expect(result.error.provider).toBe("anthropic")
    }
  })
})
