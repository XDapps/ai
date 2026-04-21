import { describe, it, expect } from "vitest"
import { defineAI } from "../../src/index.js"

const RUN = process.env["RUN_INTEGRATION"] === "1"
const API_KEY = process.env["DEEPSEEK_API_KEY"]

describe.skipIf(!RUN)("integration: deepseek", () => {
  it.skipIf(!API_KEY)("ai.text() returns ok:true for a real call", async () => {
    if (!API_KEY) {
      console.log("Skipping: DEEPSEEK_API_KEY not set")
      return
    }

    const ai = defineAI({
      use: {
        smoke: { provider: "deepseek", model: "deepseek-chat", modality: "text" },
      },
      apiKeys: { deepseek: API_KEY },
    })

    const result = await ai.text({
      use: "smoke",
      messages: [{ role: "user", content: "Say 'ok'" }],
      maxTokens: 10,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(typeof result.text).toBe("string")
      expect(result.text.length).toBeGreaterThan(0)
    }
  })
})
