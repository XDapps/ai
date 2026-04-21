import { describe, it, expect } from "vitest"
import { isProvider } from "../../src/internal/is-provider.js"

describe("isProvider", () => {
  it("returns true for anthropic", () => {
    expect(isProvider("anthropic")).toBe(true)
  })

  it("returns true for openai", () => {
    expect(isProvider("openai")).toBe(true)
  })

  it("returns true for google", () => {
    expect(isProvider("google")).toBe(true)
  })

  it("returns true for deepseek", () => {
    expect(isProvider("deepseek")).toBe(true)
  })

  it("returns false for unknown strings", () => {
    expect(isProvider("azure")).toBe(false)
    expect(isProvider("cohere")).toBe(false)
    expect(isProvider("")).toBe(false)
  })

  it("returns false for near-miss strings", () => {
    expect(isProvider("Anthropic")).toBe(false)
    expect(isProvider("OPENAI")).toBe(false)
    expect(isProvider("anthropic ")).toBe(false)
  })
})
