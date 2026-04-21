import { describe, it, expect, vi } from "vitest"
import { logCall } from "../../src/internal/log-call.js"
import type { DefineAIConfig } from "../../src/types/index.js"
import type { UseCase } from "../../src/types/providers.js"
import { makeError } from "../../src/errors.js"

type MinimalConfig = DefineAIConfig<Record<string, UseCase>>

const baseArgs = {
  use: "chat" as string | undefined,
  provider: "anthropic" as const,
  model: "claude-haiku-4-5",
  modality: "text" as const,
  startTime: performance.now() - 50,
}

function makeConfig(overrides: Partial<MinimalConfig> = {}): MinimalConfig {
  return {
    use: {},
    apiKeys: { anthropic: "sk-test" },
    ...overrides,
  }
}

describe("logCall", () => {
  it("calls logger.info on success", async () => {
    const info = vi.fn()
    const config = makeConfig({ logger: { info, warn: vi.fn(), error: vi.fn() } })
    await logCall({ ...baseArgs, config })
    expect(info).toHaveBeenCalledOnce()
    expect(info.mock.calls[0]?.[0]).toBe("llm.call")
  })

  it("calls logger.warn on error", async () => {
    const warn = vi.fn()
    const config = makeConfig({ logger: { info: vi.fn(), warn, error: vi.fn() } })
    const error = makeError("RATE_LIMITED", "too many requests", "anthropic")
    await logCall({ ...baseArgs, config, error })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toBe("llm.call.error")
  })

  it("calls onFinish with a well-shaped CallLog", async () => {
    const onFinish = vi.fn()
    const config = makeConfig({ onFinish })
    const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    await logCall({ ...baseArgs, config, usage })

    expect(onFinish).toHaveBeenCalledOnce()
    const log = onFinish.mock.calls[0]?.[0]
    expect(log).toMatchObject({
      use: "chat",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      modality: "text",
      inputTokens: 10,
      outputTokens: 20,
    })
    expect(typeof log.durationMs).toBe("number")
    expect(log.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("omits inputTokens/outputTokens when usage is absent", async () => {
    const onFinish = vi.fn()
    const config = makeConfig({ onFinish })
    await logCall({ ...baseArgs, config })
    const log = onFinish.mock.calls[0]?.[0]
    expect("inputTokens" in log).toBe(false)
    expect("outputTokens" in log).toBe(false)
  })

  it("awaits a promise-returning onFinish", async () => {
    const order: string[] = []
    const config = makeConfig({
      onFinish: async () => {
        await Promise.resolve()
        order.push("finish")
      },
    })
    await logCall({ ...baseArgs, config })
    order.push("after")
    expect(order).toEqual(["finish", "after"])
  })

  it("never throws even if logger throws", async () => {
    const config = makeConfig({
      logger: {
        info() {
          throw new Error("logger boom")
        },
        warn: vi.fn(),
        error: vi.fn(),
      },
    })
    await expect(logCall({ ...baseArgs, config })).resolves.toBeUndefined()
  })

  it("never throws even if onFinish throws", async () => {
    const config = makeConfig({
      onFinish() {
        throw new Error("onFinish boom")
      },
    })
    await expect(logCall({ ...baseArgs, config })).resolves.toBeUndefined()
  })

  it("uses model as fallback when use is undefined", async () => {
    const onFinish = vi.fn()
    const config = makeConfig({ onFinish })
    await logCall({ ...baseArgs, use: undefined, config })
    const log = onFinish.mock.calls[0]?.[0]
    expect(log.use).toBe(baseArgs.model)
  })
})
