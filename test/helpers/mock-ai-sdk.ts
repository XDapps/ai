import { vi } from "vitest"
import type { LanguageModelUsage } from "ai"

// ---------------------------------------------------------------------------
// Shared mock stubs for the "ai" package functions.
// Import and assign these in each test file's vi.mock('ai', ...) factory.
// ---------------------------------------------------------------------------

export const mockGenerateText = vi.fn()
export const mockStreamText = vi.fn()
export const mockGenerateObject = vi.fn()
export const mockGenerateImage = vi.fn()
export const mockEmbedMany = vi.fn()

// Resets all stubs between tests.
export function resetAiMocks(): void {
  mockGenerateText.mockReset()
  mockStreamText.mockReset()
  mockGenerateObject.mockReset()
  mockGenerateImage.mockReset()
  mockEmbedMany.mockReset()
}

// ---------------------------------------------------------------------------
// Shared mock stubs for provider factories.
// ---------------------------------------------------------------------------

export function makeProviderStub() {
  const languageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
  const embeddingModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
  const imageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })

  // The factory itself is callable (providerInstance(modelId))
  const factory = Object.assign(
    vi.fn().mockImplementation((id: string) => languageModel(id)),
    {
      languageModel,
      embeddingModel,
      imageModel,
      specificationVersion: "v3" as const,
    },
  )
  return factory
}

export const mockProvider = makeProviderStub()

export function resetProviderMock(): void {
  mockProvider.mockClear()
  mockProvider.languageModel.mockClear()
  mockProvider.embeddingModel.mockClear()
  mockProvider.imageModel.mockClear()
}

// ---------------------------------------------------------------------------
// Convenience builders for common result shapes.
// ---------------------------------------------------------------------------

export function makeUsage(
  inputTokens: number,
  outputTokens: number,
): LanguageModelUsage {
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
}
