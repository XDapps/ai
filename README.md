# @xdapps/ai

A thin opinionated wrapper on top of [Vercel AI SDK](https://sdk.vercel.ai/) that introduces **use-case-named profiles** — standardizing provider setup, error handling, logging hooks, and streaming chat endpoints across all XDapps dashboards. Instead of scattering model strings and provider configuration at every call site, you define named profiles once (`customerChat`, `reviewClassifier`, `productImage`) and call them by name. The wrapper normalizes errors into a typed discriminated union so TypeScript forces you to handle failures.

## Install

```bash
npm install @xdapps/ai ai zod
```

Install only the provider peer deps you actually use:

```bash
# Anthropic
npm install @ai-sdk/anthropic

# OpenAI
npm install @ai-sdk/openai

# Google
npm install @ai-sdk/google

# DeepSeek
npm install @ai-sdk/deepseek
```

For `@xdapps/ai/react`, also install:

```bash
npm install @ai-sdk/react react react-dom
```

## Quick Start

```ts
import { defineAI } from "@xdapps/ai"

const ai = defineAI({
  use: {
    customerChat: {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      modality: "text",
      temperature: 0.7,
      system: "You are a helpful support assistant.",
    },
  },
  apiKeys: {
    anthropic: process.env.ANTHROPIC_API_KEY,
  },
})

const result = await ai.text({
  use: "customerChat",
  messages: [{ role: "user", content: "Hello!" }],
})

if (!result.ok) {
  console.error(result.error.code)
  return
}
console.log(result.text)
```

## Full Config Reference

### `DefineAIConfig`

```ts
interface DefineAIConfig<U extends Record<string, UseCase>> {
  use: U                                           // use-case profiles (required)
  apiKeys: Partial<Record<Provider, string>>       // API keys per provider (required)
  logger?: {                                       // optional structured logger
    info(msg: string, data?: Record<string, unknown>): void
    warn(msg: string, data?: Record<string, unknown>): void
    error(msg: string, data?: Record<string, unknown>): void
  }
  onFinish?: (call: CallLog) => void | Promise<void>  // fires after every call
}
```

### `UseCase` variants

**Text** (use with `ai.text()`, `ai.stream()`, `ai.object()`):
```ts
{
  provider: "anthropic" | "openai" | "google" | "deepseek"
  model: string
  modality: "text"
  temperature?: number       // omit to use provider default
  maxTokens?: number
  system?: string            // call-site system overrides this
}
```

**Image** (use with `ai.image()`):
```ts
{
  provider: "anthropic" | "openai" | "google" | "deepseek"
  model: string
  modality: "image"
  size?: string              // e.g. "1024x1024"
  quality?: string           // e.g. "hd"
}
```

**Embed** (use with `ai.embed()`):
```ts
{
  provider: "anthropic" | "openai" | "google" | "deepseek"
  model: string
  modality: "embed"
}
```

### Escape hatch: `model: 'provider:modelId'`

All methods accept a `model` field as an alternative to `use`. This bypasses profile lookup and lets you target any model directly:

```ts
const result = await ai.text({
  model: "anthropic:claude-opus-4-7",
  messages: [{ role: "user", content: "Hello!" }],
})
```

The provider portion must match one of the four known providers, and the corresponding `apiKeys` entry must be set.

## Methods Reference

### `ai.text(opts)`

Non-streaming text generation.

```ts
const result = await ai.text({
  use: "customerChat",          // or model: "provider:modelId"
  messages: [{ role: "user", content: "Hello!" }],
  system: "Override system",    // optional, overrides profile system
  temperature: 0.5,             // optional, overrides profile temperature
  maxTokens: 500,               // optional
  tools: { ... },               // optional pass-through to Vercel AI SDK
})

if (!result.ok) {
  console.error(result.error.code, result.error.retryable)
  return
}
console.log(result.text)
// result.toolCalls is defined when tools were invoked
```

### `ai.stream(opts)`

Streaming text generation. Accepts the same options as `ai.text()`.

```ts
const result = await ai.stream({
  use: "customerChat",
  messages: [{ role: "user", content: "Tell me a story." }],
})

for await (const chunk of result.textStream) {
  process.stdout.write(chunk)
}
```

For route handlers, use `result.toDataStreamResponse()` (see Next.js section).

### `ai.object(opts)`

Structured output with Zod schema validation.

```ts
import { z } from "zod"

const schema = z.object({ sentiment: z.enum(["positive", "negative", "neutral"]) })

const result = await ai.object({
  use: "reviewClassifier",
  schema,
  messages: [{ role: "user", content: "This product is amazing!" }],
})

if (!result.ok) return
console.log(result.object.sentiment) // "positive"
```

### `ai.image(opts)`

Image generation.

```ts
const result = await ai.image({
  use: "productImage",
  prompt: "A minimalist product photo of a coffee mug on white background",
  n: 1,
  size: "1024x1024",
})

if (!result.ok) return
const { base64, mediaType } = result.images[0]
```

### `ai.embed(opts)`

Batch embeddings.

```ts
const result = await ai.embed({
  use: "faqEmbedder",
  values: ["How do I reset my password?", "Where is my order?"],
})

if (!result.ok) return
console.log(result.embeddings) // number[][]
```

## `LlmResult<T>` Narrowing

All methods return `Promise<LlmResult<T>>`, a discriminated union:

```ts
type LlmResult<T> = ({ ok: true } & T) | { ok: false; error: LlmError }
```

TypeScript enforces that you narrow on `result.ok` before accessing success fields:

```ts
const result = await ai.text({ use: "chat", messages })
if (!result.ok) {
  if (result.error.retryable) {
    // RATE_LIMITED or PROVIDER_UNAVAILABLE — safe to retry
  }
  return { error: result.error.code }
}
// result.text is now accessible
return { text: result.text }
```

## React Hook: `@xdapps/ai/react`

The `useAiChat` hook is a thin wrapper over `@ai-sdk/react`'s `useChat` that auto-sets the API endpoint from your use-case key.

**Critical convention**: your Next.js app must have a route at `app/api/ai/[use]/route.ts`. The hook targets `/api/ai/{use}` — this URL must exist.

```tsx
"use client"
import { useAiChat } from "@xdapps/ai/react"

export function ChatWidget() {
  const { messages, sendMessage, status } = useAiChat({ use: "customerChat" })

  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>
          {m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
        </p>
      ))}
      <button onClick={() => sendMessage({ text: "Hello!" })} disabled={status !== "ready"}>
        Send
      </button>
    </div>
  )
}
```

The hook returns the full `UseChatHelpers` object from `@ai-sdk/react` — all the same fields and methods are available.

## Next.js Route Handler: `@xdapps/ai/next`

`createChatRouteHandler` produces a Next.js App Router `POST` handler that dispatches to your `ai.stream()` by the `[use]` parameter.

```ts
// app/api/ai/[use]/route.ts
import { ai } from "@/lib/ai"
import { createChatRouteHandler } from "@xdapps/ai/next"

export const POST = createChatRouteHandler((opts) => ai.stream(opts))
```

The handler:
- Reads `ctx.params.use` (supports both Next.js 14 object and Next.js 15 Promise forms)
- Parses the `messages` array from the request body
- Returns a streaming `Response` via `result.toDataStreamResponse()`
- Returns `400` for missing or invalid request data
- Returns `500` if the stream function throws

## Error Codes Reference

| Code | Meaning | Retryable |
|---|---|---|
| `RATE_LIMITED` | Provider returned 429 or a rate-limit error | Yes |
| `AUTH_FAILED` | Invalid API key (401 or 403) | No |
| `CONTEXT_TOO_LONG` | Message history exceeds the model's context window | No |
| `CONTENT_FILTERED` | Request or response blocked by provider content policy | No |
| `PROVIDER_UNAVAILABLE` | Provider returned 5xx | Yes |
| `INVALID_RESPONSE` | Provider returned data that couldn't be parsed | No |
| `INVALID_CONFIG` | Bad use-case name, modality mismatch, missing API key at call time | No |
| `MISSING_PROVIDER_PKG` | The required `@ai-sdk/*` peer package is not installed | No |
| `UNKNOWN` | Unclassified error | No |

## Provider Setup

| Provider | Env var | Peer dep |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `@ai-sdk/anthropic` |
| OpenAI | `OPENAI_API_KEY` | `@ai-sdk/openai` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `@ai-sdk/google` |
| DeepSeek | `DEEPSEEK_API_KEY` | `@ai-sdk/deepseek` |

## Maintainer Setup

Repo maintainers must add an `NPM_TOKEN` secret to the GitHub repository settings before the release workflow can publish to npm. See `.github/workflows/release.yml`.
