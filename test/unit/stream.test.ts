import { describe, it, expect, vi, beforeEach } from "vitest"
import type * as AiModule from "ai"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockStreamText, mockLanguageModel, mockProviderInstance, mockGetProvider } =
  vi.hoisted(() => {
    const mockLanguageModel = vi.fn().mockReturnValue({ specificationVersion: "v3" })
    const mockProviderInstance = Object.assign(vi.fn(), {
      languageModel: mockLanguageModel,
      embeddingModel: vi.fn(),
      imageModel: vi.fn(),
      specificationVersion: "v3" as const,
    })
    return {
      mockStreamText: vi.fn(),
      mockLanguageModel,
      mockProviderInstance,
      mockGetProvider: vi.fn().mockResolvedValue({ ok: true, provider: mockProviderInstance }),
    }
  })

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<AiModule>()
  return { ...real, streamText: mockStreamText }
})

vi.mock("../../src/providers/registry.js", () => ({
  getProvider: mockGetProvider,
}))

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

import { stream } from "../../src/methods/stream.js"
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

async function* makeTextStream(chunks: string[]) {
  for (const c of chunks) yield c
}

function makeSdkStreamResult(chunks: string[] = ["hello"]) {
  return {
    textStream: makeTextStream(chunks),
    fullStream: makeTextStream(chunks),
    toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response("ok")),
  }
}

beforeEach(() => {
  mockStreamText.mockReset()
  mockLanguageModel.mockClear()
  mockGetProvider.mockResolvedValue({ ok: true, provider: mockProviderInstance })
})

describe("stream()", () => {
  it("returns a result with textStream on success", async () => {
    mockStreamText.mockReturnValue(makeSdkStreamResult(["hi ", "there"]))

    const result = await stream(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    const chunks: string[] = []
    for await (const chunk of result.textStream) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(["hi ", "there"])
  })

  it("toDataStreamResponse() delegates to toUIMessageStreamResponse()", async () => {
    const sdkResult = makeSdkStreamResult()
    mockStreamText.mockReturnValue(sdkResult)

    const result = await stream(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    result.toDataStreamResponse()
    expect(sdkResult.toUIMessageStreamResponse).toHaveBeenCalled()
  })

  it("surfaces pre-stream INVALID_CONFIG error through textStream", async () => {
    const result = await stream(config, {
      // @ts-expect-error intentional bad use key
      use: "nonexistent",
      messages: [{ role: "user", content: "hi" }],
    })

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of result.textStream) {
        // consume stream to trigger the throw
      }
    }).rejects.toThrow()
  })

  it("pre-stream error returns 500 from toDataStreamResponse()", async () => {
    const result = await stream(config, {
      // @ts-expect-error intentional bad use key
      use: "nonexistent",
      messages: [{ role: "user", content: "hi" }],
    })

    const response = result.toDataStreamResponse()
    expect(response.status).toBe(500)
  })

  it("returns error stream when getProvider fails", async () => {
    mockGetProvider.mockResolvedValue({
      ok: false,
      error: makeError("MISSING_PROVIDER_PKG", "install @ai-sdk/anthropic", "anthropic"),
    })

    const result = await stream(config, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    const response = result.toDataStreamResponse()
    expect(response.status).toBe(500)
  })

  it("mid-stream onError fires logCall with a normalized LlmError (plain Error → UNKNOWN)", async () => {
    const onFinish = vi.fn()
    const configWithFinish = { ...config, onFinish }

    // Capture the onError callback that stream() passes to streamText, then call it.
    let capturedOnError: ((event: { error: unknown }) => void) | undefined
    mockStreamText.mockImplementation(
      (opts: { onError?: (event: { error: unknown }) => void }) => {
        capturedOnError = opts.onError
        return makeSdkStreamResult()
      },
    )

    await stream(configWithFinish, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    expect(capturedOnError).toBeDefined()

    // Simulate a mid-stream failure with a plain Error → should normalize to UNKNOWN.
    capturedOnError?.({ error: new Error("network drop") })

    // logCall is async (void-fired), so flush microtasks.
    await Promise.resolve()
    await Promise.resolve()

    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log.error).toBeDefined()
    expect(log.error?.code).toBe("UNKNOWN")
  })

  it("mid-stream onError fires logCall with RATE_LIMITED for a 429 APICallError", async () => {
    const { APICallError } = await import("ai")
    const onFinish = vi.fn()
    const configWithFinish = { ...config, onFinish }

    let capturedOnError: ((event: { error: unknown }) => void) | undefined
    mockStreamText.mockImplementation(
      (opts: { onError?: (event: { error: unknown }) => void }) => {
        capturedOnError = opts.onError
        return makeSdkStreamResult()
      },
    )

    await stream(configWithFinish, {
      use: "chat",
      messages: [{ role: "user", content: "hi" }],
    })

    const apiError = new APICallError({
      message: "rate limited",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: {},
      responseBody: "",
      isRetryable: true,
    })

    capturedOnError?.({ error: apiError })

    await Promise.resolve()
    await Promise.resolve()

    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log.error?.code).toBe("RATE_LIMITED")
  })
})
