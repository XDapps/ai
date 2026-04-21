# Roadmap

This document lists features explicitly deferred from `v1`. These are not forgotten — they are out of scope for the initial release by design. See [docs/plans/xdapps-ai-package.md](docs/plans/xdapps-ai-package.md) for the full rationale.

## v2+ Features

- **Video generation** (Runway / Pika / Luma / Veo) — wait until one wins and Vercel AI SDK adopts it.

- **Speech-to-text / text-to-speech** — OpenAI has Whisper / TTS; AI SDK has `transcribe` / `speech`. Add when a consumer project needs it.

- **Agentic multi-step loops** — a `runAgent({ use, messages, tools, maxSteps })` method that loops tool-calls until done. Vercel AI SDK has `maxSteps` — we can expose it.

- **Prompt templating** — something like `definePrompt('support', ({name}) => \`Help ${name}...\`)` for reusable, parameterized prompts. Could be a separate `@xdappsdev/ai-prompts` package.

- **Response caching** — hash `{use, messages}` → cache in Redis/KV. Useful for classifier use cases with repeated inputs.

- **Built-in retry policy** — exponential backoff on `retryable: true` errors. Today, consumers handle this themselves by inspecting `error.retryable`.

- **Observability integrations** — first-class Helicone / LangSmith / Axiom adapters (today: `onFinish` + manual plumbing).

- **Structured streaming** — `ai.streamObject` with partial Zod object updates.

- **React components** (not just hooks) — `<AiChat use="customerChat" />` drop-in component. Requires a design system decision first.

- **Cost estimation** — maintained pricing table with `estimatedCostUsd` in `CallLog`. Explicitly deferred — consumers can compute this themselves if they want.
