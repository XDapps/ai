import type { ModelMessage, ToolSet, TypedToolCall } from "ai"
import type { z } from "zod"

export type Provider = "anthropic" | "openai" | "google" | "deepseek"

export type Modality = "text" | "image" | "embed"

// A use-case profile entry. `modality` drives which method can accept this use.
export type UseCase =
  | {
      provider: Provider
      model: string
      modality: "text"
      temperature?: number
      maxTokens?: number
      system?: string
    }
  | {
      provider: Provider
      model: string
      modality: "image"
      size?: string
      quality?: string
    }
  | {
      provider: Provider
      model: string
      modality: "embed"
    }

export interface DefineAIConfig<U extends Record<string, UseCase>> {
  use: U
  apiKeys: Partial<Record<Provider, string>>
  logger?: {
    info(msg: string, data?: Record<string, unknown>): void
    warn(msg: string, data?: Record<string, unknown>): void
    error(msg: string, data?: Record<string, unknown>): void
  }
  onFinish?: (call: CallLog) => void | Promise<void>
}

export interface CallLog {
  use: string
  provider: Provider
  model: string
  modality: Modality
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  error?: LlmError
  // raw messages/prompt omitted for privacy by default; flag in v2 if needed
}

export type LlmErrorCode =
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "CONTEXT_TOO_LONG"
  | "CONTENT_FILTERED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "INVALID_CONFIG" // e.g., use name not in config, missing API key
  | "MISSING_PROVIDER_PKG" // @ai-sdk/anthropic not installed
  | "UNKNOWN"

export interface LlmError {
  code: LlmErrorCode
  message: string
  provider?: Provider
  retryable: boolean // true for RATE_LIMITED, PROVIDER_UNAVAILABLE
}

export type LlmResult<T> = ({ ok: true } & T) | { ok: false; error: LlmError }

// Wraps Vercel's StreamTextResult; exposes streaming interfaces and a route-handler helper.
export interface LlmStreamResult {
  textStream: AsyncIterable<string>
  // fullStream is typed as unknown per-chunk; will be tightened in Phase 3 when the
  // exact Vercel StreamPart type is wired in.
  fullStream: AsyncIterable<unknown>
  toDataStreamResponse(): Response
}

export interface AI<U extends Record<string, UseCase>> {
  // --- text generation (non-streaming) ---
  text(opts: {
    use?: TextUseKey<U>
    model?: `${Provider}:${string}`
    messages: ModelMessage[]
    system?: string
    temperature?: number
    maxTokens?: number
    tools?: ToolSet
  }): Promise<LlmResult<{ text: string; toolCalls?: TypedToolCall<ToolSet>[] }>>

  // --- streaming text ---
  // LlmStreamResult wraps Vercel's StreamTextResult; exposes .toDataStreamResponse() for route handlers
  stream(opts: {
    use?: TextUseKey<U>
    model?: `${Provider}:${string}`
    messages: ModelMessage[]
    system?: string
    temperature?: number
    maxTokens?: number
    tools?: ToolSet
  }): Promise<LlmStreamResult>

  // --- structured output ---
  object<T extends z.ZodType>(opts: {
    use?: TextUseKey<U>
    model?: `${Provider}:${string}`
    schema: T
    messages: ModelMessage[]
    system?: string
  }): Promise<LlmResult<{ object: z.infer<T> }>>

  // --- image generation ---
  image(opts: {
    use?: ImageUseKey<U>
    model?: `${Provider}:${string}`
    prompt: string
    n?: number
    size?: string
  }): Promise<LlmResult<{ images: Array<{ base64: string; mediaType: string }> }>>

  // --- embeddings ---
  embed(opts: {
    use?: EmbedUseKey<U>
    model?: `${Provider}:${string}`
    values: string[]
  }): Promise<LlmResult<{ embeddings: number[][] }>>
}

// Extract keys from U whose use case has modality: 'text'
export type TextUseKey<U extends Record<string, UseCase>> = {
  [K in keyof U]: U[K] extends { modality: "text" } ? K : never
}[keyof U]

// Extract keys from U whose use case has modality: 'image'
export type ImageUseKey<U extends Record<string, UseCase>> = {
  [K in keyof U]: U[K] extends { modality: "image" } ? K : never
}[keyof U]

// Extract keys from U whose use case has modality: 'embed'
export type EmbedUseKey<U extends Record<string, UseCase>> = {
  [K in keyof U]: U[K] extends { modality: "embed" } ? K : never
}[keyof U]
