import { describe, it, expect, vi } from "vitest"
import type { ChatStreamFn } from "../../src/next/create-chat-route-handler.js"
import { createChatRouteHandler } from "../../src/next/create-chat-route-handler.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStreamFn(
  impl?: () => ReturnType<ChatStreamFn>,
): ChatStreamFn {
  const defaultImpl = vi.fn().mockResolvedValue({
    textStream: (async function* () {})(),
    fullStream: (async function* () {})(),
    toDataStreamResponse: vi.fn().mockReturnValue(new Response("ok", { status: 200 })),
  })

  return impl ? vi.fn().mockImplementation(impl) : defaultImpl
}

interface ErrorBody {
  error: { code: string; retryable: boolean }
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== "object" || value === null) return false
  if (!("error" in value)) return false
  // `in` narrows value to `object & Record<"error", unknown>` — no cast needed.
  const { error } = value
  if (typeof error !== "object" || error === null) return false
  // `in` narrows error to `object & Record<"code", unknown>` — no cast needed.
  return (
    "code" in error &&
    typeof error.code === "string" &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  )
}

async function parseErrorBody(res: Response): Promise<ErrorBody> {
  const raw: unknown = await res.json()
  if (!isErrorBody(raw)) throw new Error("Unexpected response shape")
  return raw
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const MESSAGES = [{ role: "user" as const, content: "hello" }]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createChatRouteHandler()", () => {
  it("calls streamFn with use and messages from the request", async () => {
    const streamFn = makeStreamFn()
    const handler = createChatRouteHandler(streamFn)

    const req = makeRequest({ messages: MESSAGES })
    const res = await handler(req, { params: { use: "chat" } })

    expect(streamFn).toHaveBeenCalledWith({ use: "chat", messages: MESSAGES })
    expect(res.status).toBe(200)
  })

  it("returns the response from toDataStreamResponse()", async () => {
    const expected = new Response("stream data", { status: 200 })
    const streamFn = makeStreamFn(() =>
      Promise.resolve({
        textStream: (async function* () {})(),
        fullStream: (async function* () {})(),
        toDataStreamResponse: () => expected,
      }),
    )
    const handler = createChatRouteHandler(streamFn)

    const res = await handler(makeRequest({ messages: MESSAGES }), {
      params: { use: "chat" },
    })

    expect(res).toBe(expected)
  })

  it("returns 400 INVALID_CONFIG when use param is missing", async () => {
    const streamFn = makeStreamFn()
    const handler = createChatRouteHandler(streamFn)

    const res = await handler(makeRequest({ messages: MESSAGES }), {
      params: { use: "" },
    })

    expect(res.status).toBe(400)
    const body = await parseErrorBody(res)
    expect(body.error.code).toBe("INVALID_CONFIG")
    expect(body.error.retryable).toBe(false)
    expect(streamFn).not.toHaveBeenCalled()
  })

  it("returns 400 INVALID_CONFIG when request body is not valid JSON", async () => {
    const streamFn = makeStreamFn()
    const handler = createChatRouteHandler(streamFn)

    const req = new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{{{",
    })

    const res = await handler(req, { params: { use: "chat" } })

    expect(res.status).toBe(400)
    const body = await parseErrorBody(res)
    expect(body.error.code).toBe("INVALID_CONFIG")
    expect(body.error.retryable).toBe(false)
  })

  it("returns 400 INVALID_CONFIG when messages field is not an array", async () => {
    const streamFn = makeStreamFn()
    const handler = createChatRouteHandler(streamFn)

    const res = await handler(makeRequest({ messages: "not an array" }), {
      params: { use: "chat" },
    })

    expect(res.status).toBe(400)
    const body = await parseErrorBody(res)
    expect(body.error.code).toBe("INVALID_CONFIG")
    expect(body.error.retryable).toBe(false)
  })

  it("supports async ctx.params (Next.js 15 Promise form)", async () => {
    const streamFn = makeStreamFn()
    const handler = createChatRouteHandler(streamFn)

    const res = await handler(makeRequest({ messages: MESSAGES }), {
      params: Promise.resolve({ use: "chat" }),
    })

    expect(streamFn).toHaveBeenCalledWith({ use: "chat", messages: MESSAGES })
    expect(res.status).toBe(200)
  })

  it("returns 500 UNKNOWN when streamFn rejects", async () => {
    const streamFn = makeStreamFn(() => Promise.reject(new Error("provider down")))
    const handler = createChatRouteHandler(streamFn)

    const res = await handler(makeRequest({ messages: MESSAGES }), {
      params: { use: "chat" },
    })

    expect(res.status).toBe(500)
    const body = await parseErrorBody(res)
    expect(body.error.code).toBe("UNKNOWN")
    expect(body.error.retryable).toBe(false)
  })
})
