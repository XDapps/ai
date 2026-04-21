import type { ModelMessage, ToolSet, TypedToolCall } from "ai"
import type { z } from "zod"
import type { Modality, Provider, UseCase } from "./providers.js"
import type { LlmResult } from "./errors.js"

// Narrow the keys of U to those whose use case has the given modality.
export type UseKeyFor<U extends Record<string, UseCase>, M extends Modality> = {
  [K in keyof U]: U[K] extends { modality: M } ? K : never
}[keyof U]

export type TextUseKey<U extends Record<string, UseCase>> = UseKeyFor<U, "text">
export type ImageUseKey<U extends Record<string, UseCase>> = UseKeyFor<U, "image">
export type EmbedUseKey<U extends Record<string, UseCase>> = UseKeyFor<U, "embed">

// Wraps Vercel's StreamTextResult; exposes streaming interfaces and a route-handler helper.
export interface LlmStreamResult {
  textStream: AsyncIterable<string>
  // fullStream per-chunk type will be tightened in Phase 3 when Vercel's StreamPart is wired in.
  fullStream: AsyncIterable<unknown>
  toDataStreamResponse(): Response
}

export interface AI<U extends Record<string, UseCase>> {
  text(opts: {
    use?: TextUseKey<U>
    model?: `${Provider}:${string}`
    messages: ModelMessage[]
    system?: string
    temperature?: number
    maxTokens?: number
    tools?: ToolSet
  }): Promise<LlmResult<{ text: string; toolCalls?: TypedToolCall<ToolSet>[] }>>

  stream(opts: {
    use?: TextUseKey<U>
    model?: `${Provider}:${string}`
    messages: ModelMessage[]
    system?: string
    temperature?: number
    maxTokens?: number
    tools?: ToolSet
  }): Promise<LlmStreamResult>

  object<T extends z.ZodType>(opts: {
    use?: TextUseKey<U>
    model?: `${Provider}:${string}`
    schema: T
    messages: ModelMessage[]
    system?: string
  }): Promise<LlmResult<{ object: z.infer<T> }>>

  image(opts: {
    use?: ImageUseKey<U>
    model?: `${Provider}:${string}`
    prompt: string
    n?: number
    size?: string
  }): Promise<LlmResult<{ images: Array<{ base64: string; mediaType: string }> }>>

  embed(opts: {
    use?: EmbedUseKey<U>
    model?: `${Provider}:${string}`
    values: string[]
  }): Promise<LlmResult<{ embeddings: number[][] }>>
}
