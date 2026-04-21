import type { ModelMessage } from "ai"
import type { LlmStreamResult } from "../types/ai.js"
import type { LlmError } from "../types/errors.js"
import { makeError } from "../errors.js"

// At the HTTP boundary the use-key is inherently a runtime string. Accepting a
// functional adapter (rather than AI<U> directly) avoids crossing the
// compile-time generic boundary and removes the need for any type predicates.
export type ChatStreamFn = (opts: {
  use: string
  messages: ModelMessage[]
}) => Promise<LlmStreamResult>

function errorResponse(status: number, error: LlmError): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function isModelMessageArray(value: unknown): value is ModelMessage[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (m) => typeof m === "object" && m !== null && "role" in m && "content" in m,
  )
}

// Returns the messages array from a parsed request body, or null if invalid.
function parseMessages(body: unknown): ModelMessage[] | null {
  if (typeof body !== "object" || body === null) return null
  if (!("messages" in body)) return null
  // `in` narrows body to `object & { messages: unknown }` — no cast needed.
  if (!isModelMessageArray(body.messages)) return null
  return body.messages
}

/**
 * Factory that returns a Next.js App Router route handler bound to a stream
 * function. Mount it at `app/api/ai/[use]/route.ts`:
 *
 * ```ts
 * export const POST = createChatRouteHandler((opts) => ai.stream(opts))
 * ```
 */
export function createChatRouteHandler(
  streamFn: ChatStreamFn,
): (
  req: Request,
  ctx: { params: Promise<{ use: string }> | { use: string } },
) => Promise<Response> {
  return async (req, ctx) => {
    // Next 13–14 passed params as a plain object; Next 15 passes a Promise.
    const params =
      ctx.params instanceof Promise ? await ctx.params : ctx.params

    const useParam: string | undefined = params.use

    if (!useParam || typeof useParam !== "string") {
      return errorResponse(400, makeError("INVALID_CONFIG", "Missing use parameter"))
    }

    let messages: ModelMessage[]
    try {
      const body: unknown = await req.json()
      const parsed = parseMessages(body)
      if (!parsed) {
        return errorResponse(400, makeError("INVALID_CONFIG", "Request body must include a messages array"))
      }
      messages = parsed
    } catch {
      return errorResponse(400, makeError("INVALID_CONFIG", "Could not parse request body as JSON"))
    }

    try {
      const result = await streamFn({ use: useParam, messages })
      return result.toDataStreamResponse()
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred"
      return errorResponse(500, makeError("UNKNOWN", message))
    }
  }
}
