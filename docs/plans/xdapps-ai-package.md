# `@xdapps/ai` Package — Implementation Plan

> **For the executing agent:** This plan is self-contained. Every decision below was made explicitly during a planning conversation. Do not re-litigate decisions marked as "Locked." The "Why" column captures the rationale so you can make consistent judgment calls on edge cases. If you hit a decision point genuinely not covered here, pause and ask the user.

---

## Context

XDapps is building a Next.js template (`/Users/jerry/Documents/code/nextjs_template/`) that will be the foundation for ~30 client dashboards (admin panels, customer apps, internal tools). Each dashboard may need LLM features, and each may need different provider/model combinations — one client wants Anthropic Haiku for customer chat, another wants OpenAI GPT-5-mini for classification, another wants Google Gemini for image captioning.

Rolling custom LLM code per client is waste. Using Vercel AI SDK directly at every callsite means every dashboard ends up with scattered model strings, duplicated provider setup, inconsistent error handling, and no central logging.

This package solves that by being a **thin opinionated wrapper on top of Vercel AI SDK** that introduces one concept — **use-case-named profiles** — and standardizes error handling, logging hooks, and streaming chat endpoints across all dashboards.

We (XDapps) are the only consumer. Build it the way we want to use it. If we open-source later, fine, but do not design for hypothetical external users.

---

## Decisions Locked

| # | Decision | Why |
|---|---|---|
| 1 | **Package name:** `@xdapps/ai` | XDapps is the GitHub org; `ai` is the short import name. |
| 2 | **Repo:** `github.com/XDapps/ai` | Standalone repo, separate release cadence from the Next.js template. |
| 3 | **Public repo + public npm package** | No proprietary logic in the wrapper; keys and use cases all live in consumer projects. Public eliminates auth-token plumbing in every CI and dev environment. |
| 4 | **Built on Vercel AI SDK (the `ai` package), no fork** | Free provider coverage, free model updates, free bug fixes. Wrapper stays ~300 LOC. |
| 5 | **Abstraction = use-case profiles, not quality tiers** | Avoided names like `fast`/`smart`/`cheap` because they conflate orthogonal dimensions (speed, cost, quality, modality) into value judgments. Use-case names (`customerChat`, `reviewClassifier`) are concrete decisions made once per use case. |
| 6 | **Modality = method, not profile attribute** | `ai.text`, `ai.stream`, `ai.object`, `ai.image`, `ai.embed` are separate methods. Each use case is tied to exactly one modality and enforced at the type level. |
| 7 | **Providers day one:** anthropic, openai, google, deepseek | The four we expect to need. Others added as consumer projects demand. |
| 8 | **Each `@ai-sdk/*` provider is an optional peer dependency** | Consumer projects install only the providers they use. Wrapper dynamically imports at runtime; missing peer throws a clear error. |
| 9 | **Error handling = discriminated union (`LlmResult`), not thrown errors** | AI-agent-authored dashboard code is more likely to forget `try/catch` than to forget narrowing a discriminated union. TypeScript forces the caller to handle the failure path. Explicit safety > ergonomic brevity. |
| 10 | **Top-level methods:** `ai.text`, `ai.stream`, `ai.object`, `ai.image`, `ai.embed` | Covers the v1 modalities. `ai.stream` streams text; streaming structured/image punted to v2 if needed. |
| 11 | **No `defaults` block in config** | Temperature/maxTokens depend entirely on the use case. A global default invites lazy "ignore it" behavior — which we explicitly want to avoid. Each use case states its own values; omitted fields fall through to the provider SDK's default (we don't invent one). |
| 12 | **System prompts allowed in both config and call-site; call-site wins** | Stable prompts (classifiers, summarizers) live in config for DRY. Dynamic prompts (chat with runtime user data) pass at call-site. Call-site always overrides config. The `onFinish` hook logs the actual prompt sent so there's no mystery. |
| 13 | **Logging:** optional `logger` + optional `onFinish` callback. Both properties on `defineAI()`. No built-in Sentry/Helicone/etc. | Pluggable, zero opinion, zero lock-in. Consumer projects wire in whatever they use. |
| 14 | **Token counts only in `onFinish`; no dollar-cost computation** | Prices drift, batch pricing differs from on-demand, maintaining a pricing table is pointless. Consumer projects compute dollars themselves if needed. |
| 15 | **Versioning:** Changesets + GitHub Action publish on merge to `main` | Standard modern workflow. `npx changeset` prompts for semver bump and changelog entry. |
| 16 | **React hooks in v1 (`@xdapps/ai/react`)** | Thin `useAiChat({ use })` wrapper that auto-configures the endpoint. Requires standardizing chat endpoints at `app/api/ai/[use]/route.ts` — document this convention in the README. |
| 17 | **Testing:** Vitest | Matches Next.js template for consistency. |
| 18 | **Build:** tsup → ESM + CJS + `.d.ts`, Node 20+ target | Standard for modern TS libraries. |
| 19 | **Lint/format:** ESLint + Prettier (same config style as the Next.js template) | Consistency across codebases. |
| 20 | **Repo-level docs must capture v2 roadmap in a `ROADMAP.md`** | Deferred features must not be forgotten. |
| 21 | **Strict TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, no `any`, no type casts | Per user's global preferences. Use type guards and proper interfaces. |

---

## Package API Surface

### `defineAI(config)` — the one factory

```ts
import type { LanguageModelV1 } from 'ai'
import { z } from 'zod'

type Provider = 'anthropic' | 'openai' | 'google' | 'deepseek'
type Modality = 'text' | 'image' | 'embed'

// A use-case profile entry. `modality` drives which method can accept this use.
type UseCase =
  | { provider: Provider; model: string; modality: 'text';  temperature?: number; maxTokens?: number; system?: string }
  | { provider: Provider; model: string; modality: 'image'; size?: string; quality?: string }
  | { provider: Provider; model: string; modality: 'embed' }

interface DefineAIConfig<U extends Record<string, UseCase>> {
  use: U
  apiKeys: Partial<Record<Provider, string>>
  logger?: {
    info(msg: string, data?: Record<string, unknown>): void
    warn(msg: string, data?: Record<string, unknown>): void
    error(msg: string, data?: Record<string, unknown>): void
  }
  onFinish?: (call: CallLog) => void | Promise<void>
}

interface CallLog {
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

function defineAI<U extends Record<string, UseCase>>(config: DefineAIConfig<U>): AI<U>
```

### The returned `ai` object

```ts
interface AI<U extends Record<string, UseCase>> {
  // --- text generation (non-streaming) ---
  text(opts: {
    use?: TextUseKey<U>                      // type-enforced: only 'text' modality use cases
    model?: `${Provider}:${string}`          // escape hatch for unregistered models
    messages: Message[]
    system?: string                          // overrides profile's system
    temperature?: number
    maxTokens?: number
    tools?: ToolSet                          // pass-through to Vercel AI SDK
  }): Promise<LlmResult<{ text: string; toolCalls?: ToolCall[] }>>

  // --- streaming text ---
  stream(opts: { /* same as text() */ }): Promise<LlmStreamResult>
  // LlmStreamResult wraps Vercel's StreamTextResult; exposes .toDataStreamResponse() for route handlers

  // --- structured output ---
  object<T extends z.ZodType>(opts: {
    use?: TextUseKey<U>
    model?: `${Provider}:${string}`
    schema: T
    messages: Message[]
    system?: string
  }): Promise<LlmResult<{ object: z.infer<T> }>>

  // --- image generation ---
  image(opts: {
    use?: ImageUseKey<U>                     // type-enforced: only 'image' modality use cases
    model?: `${Provider}:${string}`
    prompt: string
    n?: number
    size?: string
  }): Promise<LlmResult<{ images: Array<{ base64: string; mediaType: string }> }>>

  // --- embeddings ---
  embed(opts: {
    use?: EmbedUseKey<U>                     // type-enforced: only 'embed' modality use cases
    model?: `${Provider}:${string}`
    values: string[]
  }): Promise<LlmResult<{ embeddings: number[][] }>>
}
```

### `LlmResult<T>` — the return shape

```ts
type LlmErrorCode =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'CONTEXT_TOO_LONG'
  | 'CONTENT_FILTERED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'INVALID_CONFIG'       // e.g., use name not in config, missing API key
  | 'MISSING_PROVIDER_PKG' // @ai-sdk/anthropic not installed
  | 'UNKNOWN'

interface LlmError {
  code: LlmErrorCode
  message: string
  provider?: Provider
  retryable: boolean       // true for RATE_LIMITED, PROVIDER_UNAVAILABLE
}

type LlmResult<T> = { ok: true } & T | { ok: false; error: LlmError }
```

Usage example:
```ts
const result = await ai.text({ use: 'customerChat', messages })
if (!result.ok) {
  if (result.error.retryable) { /* retry */ }
  return { error: result.error.code }
}
return { text: result.text }
```

### React sub-path: `@xdapps/ai/react`

```ts
// Thin wrapper over Vercel's useChat. Auto-wires to /api/ai/{use}.
export function useAiChat(opts: {
  use: string              // must match a configured 'text' modality use case
  initialMessages?: Message[]
  onError?: (err: Error) => void
}): ReturnType<typeof useChat>
```

Consumer project convention (**document prominently in README**):
```
app/api/ai/[use]/route.ts   ← single handler, dispatches by [use] param
```

### Convention handler (shipped as an exported helper)

```ts
// @xdapps/ai/next (another sub-path)
export function createChatRouteHandler(ai: AI<any>): (req: Request, ctx: { params: { use: string } }) => Promise<Response>
```

Consumer project:
```ts
// app/api/ai/[use]/route.ts
import { ai } from '@/lib/ai'
import { createChatRouteHandler } from '@xdapps/ai/next'
export const POST = createChatRouteHandler(ai)
```

---

## Config Example (what a consumer project writes)

```ts
// ai.config.ts
import { defineAI } from '@xdapps/ai'
import { env } from '@/env'

export const ai = defineAI({
  use: {
    customerChat: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      modality: 'text',
      temperature: 0.7,
      system: 'You are a customer support assistant for Acme Inc. Be concise and friendly.',
    },
    reviewClassifier: {
      provider: 'openai',
      model: 'gpt-5-mini',
      modality: 'text',
      temperature: 0,
      system: 'Classify the sentiment of the given review.',
    },
    reportSummary: {
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      modality: 'text',
      maxTokens: 4000,
    },
    productImage: {
      provider: 'openai',
      model: 'gpt-image-1',
      modality: 'image',
      size: '1024x1024',
    },
    faqEmbedder: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      modality: 'embed',
    },
  },
  apiKeys: {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
  },
  logger: console,
  onFinish: (call) => {
    // e.g., write to DB, post to Slack, ship to Helicone
    console.log(`[ai] ${call.use} ${call.provider}:${call.model} ${call.durationMs}ms`)
  },
})
```

Then `lib/ai.ts` in the consumer project:
```ts
export { ai } from '../ai.config'
```

---

## Repo File Structure

```
xdapps-ai/                                  # cloned as `ai` under XDapps org
├── .changeset/
│   └── config.json
├── .github/
│   └── workflows/
│       ├── ci.yml                          # lint + typecheck + test on PR
│       └── release.yml                     # changesets publish on merge to main
├── src/
│   ├── index.ts                            # public exports (defineAI, types)
│   ├── define-ai.ts                        # defineAI() implementation
│   ├── types.ts                            # all shared types
│   ├── errors.ts                           # LlmError, normalizeError()
│   ├── providers/
│   │   ├── registry.ts                     # dynamic import + cache of providers
│   │   ├── anthropic.ts                    # thin factory: createAnthropic(apiKey)
│   │   ├── openai.ts
│   │   ├── google.ts
│   │   └── deepseek.ts
│   ├── methods/
│   │   ├── text.ts                         # ai.text implementation
│   │   ├── stream.ts                       # ai.stream implementation
│   │   ├── object.ts                       # ai.object implementation
│   │   ├── image.ts                        # ai.image implementation
│   │   └── embed.ts                        # ai.embed implementation
│   ├── internal/
│   │   ├── resolve-use.ts                  # use-case lookup + merge with call-site opts
│   │   ├── log-call.ts                     # logger + onFinish plumbing
│   │   └── validate-config.ts              # zod validation of defineAI input
│   ├── react/
│   │   └── use-ai-chat.ts                  # useAiChat hook (exported from @xdapps/ai/react)
│   └── next/
│       └── create-chat-route-handler.ts    # exported from @xdapps/ai/next
├── test/
│   ├── unit/
│   │   ├── define-ai.test.ts
│   │   ├── resolve-use.test.ts
│   │   ├── errors.test.ts
│   │   ├── text.test.ts
│   │   ├── stream.test.ts
│   │   ├── object.test.ts
│   │   ├── image.test.ts
│   │   └── embed.test.ts
│   ├── integration/                        # gated behind env var, manual run
│   │   ├── anthropic.test.ts
│   │   ├── openai.test.ts
│   │   ├── google.test.ts
│   │   └── deepseek.test.ts
│   └── helpers/
│       ├── mock-ai-sdk.ts                  # Vitest mock for 'ai' package at boundary
│       └── fixtures.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .npmignore
├── LICENSE                                 # MIT
├── README.md                               # public docs
├── ROADMAP.md                              # explicit v2+ features
└── CHANGELOG.md                            # generated by changesets
```

---

## Implementation Steps

Execute in this order. Each step is independently testable.

### Step 1 — Repo initialization

1. Create the GitHub repo via `gh repo create XDapps/ai --public --description "Internal LLM wrapper on Vercel AI SDK with use-case profiles"`.
2. Clone locally. Initialize package.json (`name: "@xdapps/ai"`, `version: "0.0.0"`, `type: "module"`).
3. Add `LICENSE` (MIT), `.gitignore` (node_modules, dist, .env, coverage), `.npmignore` (src, test, tsconfig).
4. Initial commit.

### Step 2 — TypeScript + tsup + Vitest + ESLint + Prettier

1. Install dev deps: `typescript`, `tsup`, `vitest`, `@vitest/coverage-v8`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-config-prettier`, `prettier`, `@types/node`.
2. `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2022"`, `declaration: true`.
3. `tsup.config.ts`: multiple entry points: `src/index.ts` (main), `src/react/index.ts` (react sub-path), `src/next/index.ts` (next sub-path). Output both ESM + CJS + `.d.ts`. Target Node 20.
4. `package.json` `exports` field with three sub-paths: `.`, `./react`, `./next`. Each with `import`, `require`, and `types` entries.
5. `vitest.config.ts` with node env for unit tests, jsdom for React hook tests.
6. ESLint config consistent with Next.js template style. Prettier config.
7. Scripts: `build`, `dev` (tsup watch), `test`, `test:watch`, `test:integration`, `lint`, `format`, `typecheck`.

### Step 3 — Core types (`src/types.ts`)

Write all types listed in the "Package API Surface" section above. Export from `src/index.ts`.

### Step 4 — Error handling (`src/errors.ts`)

1. Define `LlmError` and `LlmErrorCode` enum.
2. Write `normalizeError(err: unknown, provider: Provider): LlmError` that maps Vercel AI SDK error classes to our codes.
   - `ai` package throws various error classes — check `err.name` / `err instanceof` against `AI_APICallError`, `AI_RateLimitError`, `AI_InvalidResponseDataError`, etc.
   - Map HTTP 429 → `RATE_LIMITED` (retryable: true)
   - Map HTTP 401/403 → `AUTH_FAILED`
   - Map HTTP 400 with "context" keyword → `CONTEXT_TOO_LONG`
   - Map content filter → `CONTENT_FILTERED`
   - Map HTTP 5xx → `PROVIDER_UNAVAILABLE` (retryable: true)
   - Unknown → `UNKNOWN`
3. Unit tests for each mapping.

### Step 5 — Provider registry (`src/providers/`)

1. `registry.ts`: exports `async function getProvider(p: Provider, apiKey: string)` that dynamically imports the right `@ai-sdk/*` package and calls its factory (e.g., `createAnthropic({ apiKey })`). Cache by `(provider, apiKey)` key.
2. If `import('@ai-sdk/anthropic')` throws, return `LlmError` with code `MISSING_PROVIDER_PKG` and message `Install @ai-sdk/anthropic to use the 'anthropic' provider.`
3. Individual provider files are just thin factory wrappers, kept separate so if a provider has special setup (like DeepSeek's `baseURL`) it lives in one file.
4. Each `@ai-sdk/*` package goes in `peerDependenciesMeta` as `{ optional: true }` in package.json.

### Step 6 — Config validation (`src/internal/validate-config.ts`)

1. Use zod to validate the shape of `defineAI` input at runtime.
2. Checks: every use case references a provider that has an API key; every use case has a valid modality; model string is non-empty.
3. On failure, throw `LlmFactoryError` (NOT return Result — this is startup-time, fail fast).

### Step 7 — `defineAI` factory (`src/define-ai.ts`)

1. Validates config (step 6).
2. Returns an `ai` object with `.text`, `.stream`, `.object`, `.image`, `.embed` methods closed over the config.
3. Each method delegates to its implementation in `src/methods/`.

### Step 8 — `resolve-use` helper (`src/internal/resolve-use.ts`)

1. `resolveUse(config, useName, modality, callSiteOpts)`: looks up the use case, checks modality matches (throws if not — this also backs the compile-time check, but runtime check is belt-and-suspenders), merges profile fields with call-site overrides (call-site wins).
2. Returns a resolved `{ provider, model, apiKey, ...opts }` object ready for the AI SDK call.
3. If `useName` is `undefined` and `model` is a `${Provider}:${string}` string → parse the escape hatch model.
4. If neither `use` nor `model` provided → return config error.

### Step 9 — `ai.text` (`src/methods/text.ts`)

1. Resolve use/model → get provider instance → call Vercel's `generateText({ model, messages, temperature, maxTokens, system, tools })`.
2. Wrap in try/catch. On error, call `normalizeError` → return `{ ok: false, error }`.
3. On success, call `logCall` (step 10) with the result → return `{ ok: true, text, toolCalls }`.

### Step 10 — `logCall` helper (`src/internal/log-call.ts`)

1. Accepts `{ config, use, provider, model, modality, startTime, result, error? }`.
2. Computes `durationMs = performance.now() - startTime`.
3. Extracts `inputTokens` / `outputTokens` from Vercel's result `usage` field.
4. If `config.logger`, calls `logger.info` (or `.warn` on error).
5. If `config.onFinish`, calls it with the `CallLog` object.
6. Never throws — logging must not break the main call.

### Step 11 — `ai.stream` (`src/methods/stream.ts`)

1. Same resolution as `text`, but calls Vercel's `streamText`.
2. Returns a wrapper object with:
   - `.textStream` — AsyncIterable<string>
   - `.fullStream` — AsyncIterable<StreamPart> (pass-through)
   - `.toDataStreamResponse()` — pass-through for route handlers
3. `logCall` fires in the stream's `onFinish` callback (Vercel AI SDK exposes it).
4. Error handling: if the initial call throws, return `LlmResult` with error. If the stream itself errors mid-flight, it surfaces via the stream's error channel (Vercel's existing mechanism).

### Step 12 — `ai.object` (`src/methods/object.ts`)

1. Delegates to Vercel's `generateObject({ model, schema, messages, system })`.
2. Returns `{ ok: true, object }` or `{ ok: false, error }`.

### Step 13 — `ai.image` (`src/methods/image.ts`)

1. Uses Vercel's `experimental_generateImage` (or whatever the stable API is at build time — check `ai` package docs).
2. Returns `{ ok: true, images }` where each image has `base64` and `mediaType`.

### Step 14 — `ai.embed` (`src/methods/embed.ts`)

1. Delegates to Vercel's `embedMany({ model, values })`.
2. Returns `{ ok: true, embeddings }`.

### Step 15 — React hook (`src/react/use-ai-chat.ts`)

1. Thin wrapper over `@ai-sdk/react`'s `useChat`.
2. Accepts `{ use: string, initialMessages?, onError? }`.
3. Auto-sets `api: \`/api/ai/${use}\``.
4. Returns the full `useChat` result.
5. `@ai-sdk/react` is an optional peer dep (only needed if the consumer uses `@xdapps/ai/react`).

### Step 16 — Next.js route handler helper (`src/next/create-chat-route-handler.ts`)

1. Exports `createChatRouteHandler(ai)` that returns `async (req, ctx) => Response`.
2. Parses `ctx.params.use`, validates it against `ai`'s configured use cases, extracts `messages` from the request body.
3. Calls `ai.stream({ use, messages })`, returns `result.toDataStreamResponse()`.
4. On invalid `use` → 400; on stream error → 500 with structured error body.

### Step 17 — Tests

1. **Unit tests** for every module. Mock `ai` package using Vitest's `vi.mock('ai', ...)` so no network calls.
2. **Integration tests** for each provider. Gated by `RUN_INTEGRATION=1` env var. Each test makes one real call with a trivial prompt (e.g., "Say 'ok'") and asserts `result.ok === true`. Don't run in CI — manual only.
3. Coverage target: 80%+ on unit tests.

### Step 18 — Documentation

1. **README.md** with:
   - What it is, one-paragraph elevator pitch
   - Install (`npm i @xdapps/ai @ai-sdk/anthropic @ai-sdk/openai`)
   - Quick start (`defineAI` + call example)
   - Full config reference (all fields, all modalities)
   - All five methods with examples
   - React hook usage with the `/api/ai/[use]/route.ts` convention
   - Error codes reference
   - Provider setup (env vars, which peer deps)
2. **ROADMAP.md** with the v2 deferral list (see below).
3. **CHANGELOG.md** — initial entry for `0.1.0`, then managed by Changesets.

### Step 19 — CI

1. `.github/workflows/ci.yml`: on PR to main, run `lint`, `typecheck`, `test` (unit only).
2. `.github/workflows/release.yml`: on merge to main, run Changesets action — if changesets are pending, opens a "Version Packages" PR; when that PR merges, publishes to npm.
3. Requires `NPM_TOKEN` secret in the repo settings (user must set this manually after first run).

### Step 20 — Initial release

1. Add a changeset: `npx changeset` → major: no, minor: yes, description: "Initial release with text/stream/object/image/embed methods, anthropic/openai/google/deepseek providers, React hook, Next.js route handler."
2. Commit, merge to main.
3. Changesets opens version PR → bump to 0.1.0.
4. Merge version PR → auto-publish to npm.

---

## ROADMAP.md (v2+ features — DO NOT BUILD IN v1)

Capture these explicitly in `ROADMAP.md` so they're not forgotten:

- **Video generation** (Runway / Pika / Luma / Veo) — wait until one wins and Vercel AI SDK adopts it.
- **Speech-to-text / text-to-speech** — OpenAI has Whisper / TTS; AI SDK has `transcribe` / `speech`. Add when a consumer project needs it.
- **Agentic multi-step loops** — a `runAgent({ use, messages, tools, maxSteps })` method that loops tool-calls until done. Vercel AI SDK has `maxSteps` — we can expose it.
- **Prompt templating** — something like `definePrompt('support', ({name}) => \`Help \${name}...\`)` for reusable, parameterized prompts. Could be separate `@xdapps/ai-prompts` package.
- **Response caching** — hash `{use, messages}` → cache in Redis/KV. Useful for classifier use cases with repeated inputs.
- **Built-in retry policy** — exponential backoff on `retryable: true` errors. Today, consumers handle this themselves by inspecting `error.retryable`.
- **Observability integrations** — first-class Helicone / LangSmith / Axiom adapters (today: `onFinish` + manual plumbing).
- **Structured streaming** — `ai.streamObject` with partial zod object updates.
- **React components** (not just hooks) — `<AiChat use="customerChat" />` drop-in component. Requires a design system decision first.
- **Cost estimation** — maintained pricing table with `estimatedCostUsd` in `CallLog`. Explicitly deferred — consumers can compute this themselves if they want.

---

## Verification Checklist (run after step 20)

1. `npm install` in a fresh clone completes clean.
2. `npm run typecheck` passes.
3. `npm run lint` passes.
4. `npm test` — all unit tests pass.
5. `npm run build` produces `dist/` with `.js`, `.mjs`, `.d.ts` for all three entry points (`.`, `./react`, `./next`).
6. Manual smoke test: create a throwaway Node script that imports from `./dist/index.mjs`, runs `defineAI` with a single anthropic use case, calls `ai.text(...)`, verifies `result.ok === true`. Repeat with a deliberately bad API key, verify `result.ok === false` and `result.error.code === 'AUTH_FAILED'`.
7. Publish to npm (via CI on merge), then in a separate fresh Node project: `npm install @xdapps/ai @ai-sdk/anthropic` and verify the package installs + imports work.
8. Type-level check: in a consumer project, verify `ai.text({ use: 'productImage' })` (where `productImage` is an image-modality use case) **fails at compile time**.
9. Integration tests pass for at least anthropic + openai with `RUN_INTEGRATION=1`.

---

## Out of Scope (v1 — explicit non-goals)

- Forking Vercel AI SDK
- Building our own provider SDKs
- Supporting providers beyond anthropic/openai/google/deepseek
- Video generation
- Speech-to-text / text-to-speech
- Agentic multi-step loops
- Prompt templating
- Response caching
- Built-in retry (beyond what Vercel AI SDK does)
- Helicone / LangSmith / Sentry integrations
- Dollar-cost computation
- React `<AiChat />` component (only the hook)
- Structured streaming
- Open-source marketing (no external-user onboarding docs beyond a basic README)

---

## Sequence with the Next.js Template

This package ships **first**. The Next.js template currently has `lib/ai.ts` as a stub. After `@xdapps/ai@0.1.0` is published:

1. Update the Next.js template's `lib/ai.ts` stub to be a working file that imports from `@xdapps/ai` and re-exports a configured instance (after `ai.config.ts` is filled in).
2. Update `AGENT-SETUP.md` in the template with a new section: "If this client needs LLM features: install `@xdapps/ai` + relevant `@ai-sdk/*` peer deps, create `ai.config.ts`, set env vars, optionally add `app/api/ai/[use]/route.ts` using `createChatRouteHandler`."
3. This is a **separate plan/execution** — do not bundle into this package's initial release.
