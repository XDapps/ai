import { describe, it, expect } from "vitest"
import { LlmFactoryError } from "../../src/internal/factory-error.js"

describe("LlmFactoryError", () => {
  it("is an instance of Error", () => {
    const err = new LlmFactoryError("bad config")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(LlmFactoryError)
  })

  it("sets name to LlmFactoryError", () => {
    const err = new LlmFactoryError("bad config")
    expect(err.name).toBe("LlmFactoryError")
  })

  it("stores the message", () => {
    const err = new LlmFactoryError("Invalid config.")
    expect(err.message).toBe("Invalid config.")
  })

  it("stores issues array when provided", () => {
    const issues = ["missing key for 'anthropic'", "empty model string"]
    const err = new LlmFactoryError("Invalid defineAI config.", issues)
    expect(err.issues).toEqual(issues)
  })

  it("defaults issues to an empty array when not provided", () => {
    const err = new LlmFactoryError("bad config")
    expect(err.issues).toEqual([])
  })
})
