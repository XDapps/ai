# `@xdapps/ai` — Build Phasing Plan

## Context

The detailed implementation plan at [docs/plans/xdapps-ai-package.md](docs/plans/xdapps-ai-package.md) defines a complete `@xdapps/ai` package across **20 sequential steps**, **21 locked decisions**, **3 build entry points** (`.`, `./react`, `./next`), and **5 method modalities** (text, stream, object, image, embed). Executing all 20 steps in a single agent run risks context loss, partial completion, and skipped verification.

This document phases that work into **5 build phases**. Each phase is independently verifiable, has a clear exit criterion, and produces a checkpoint that can be code-reviewed in isolation. A single builder agent executes each phase straight from this doc — no re-planning between phases (per user's preference). The source plan ([docs/plans/xdapps-ai-package.md](docs/plans/xdapps-ai-package.md)) remains the **authoritative spec** for every API shape, error code, file path, and locked decision; this doc is purely the execution sequence.

**Starting state:** [/Users/jerry/Documents/code/ai/](/Users/jerry/Documents/code/ai/) contains only `docs/plans/xdapps-ai-package.md`. No git repo, no GitHub repo, no `package.json`, no `node_modules`. The `gh` CLI is authenticated as the `XDapps` account.

---

## How To Use This Document

1. Each phase below maps to a contiguous block of steps in [xdapps-ai-package.md](docs/plans/xdapps-ai-package.md). When executing a phase, **open the source plan and follow the exact step-by-step instructions there** — do not paraphrase or skip.
2. Locked decisions in the source plan (rows 1–21 of the "Decisions Locked" table) are **not up for re-litigation**. If a genuinely new decision comes up that isn't covered, pause and ask the user.
3. The **Exit Criteria** at the end of each phase below is the gate. Do not advance to the next phase until every exit criterion passes.
4. When a phase finishes, commit the work to git with a conventional commit message (`feat:`, `chore:`, etc.) and push to the GitHub remote (created in Phase 1). Each phase = one or more commits, but at minimum one final commit per phase.
5. After the final phase, run the full **Final Verification Checklist** (bottom of this doc).

---

## Cross-Cutting Standards — Apply to Every Phase

These rules are **non-negotiable** for every phase. The reviewer agent must enforce them. The builder agent must bake them in from the start — do not ship a file that violates any of these "because it'll be cleaned up later."

### Readability
- **Line budget per file:** aim for ≤150 lines, hard cap ≤250. If a file crosses 150, pause and split *before* continuing to add to it.
- **One concept per file.** A file's name should describe exactly what's in it; if the name needs "and" or "utils" or "helpers," split it.
- **Explicit over clever.** A named intermediate variable beats a chained one-liner. A function that does one thing beats a flag-parameter function that does two.
- **Comments explain *why*, not *what*.** If a reader could derive the "what" by reading the code, no comment. Comments are reserved for: hidden constraints, workarounds, surprising invariants, or cross-file coupling.

### Abstraction rules — extract when, not before
Premature abstraction is as bad as no abstraction. The trigger points:
- **Duplication:** same logic in 2+ places → extract to a named helper. Not 3 places. Two is the signal.
- **Mixed concerns:** a function that does IO + transformation + logging → split by concern.
- **Boilerplate across call-sites:** if every method file is doing `resolveUse → getProvider → logCall` in the same shape → extract a `runCall(config, opts, fn)` wrapper in `src/internal/` and collapse each method body to just the AI-SDK-specific call.
- **Repeated type shapes:** if three types share `{ use?, model? }` → extract a `BaseCallOpts` and `extends` it.

### When NOT to abstract
- Hypothetical future flexibility ("in case we add a 6th provider"). Four providers aren't ten; don't build for ten.
- Configuration knobs nothing consumes today.
- "Just in case" wrappers around single-line SDK calls.

### Directory layout — keep shallow but meaningful
- `src/types/` — split by topic (`providers.ts`, `errors.ts`, `config.ts`, `ai.ts`), never one megafile.
- `src/methods/` — one file per method, each ≤150 lines. If `text.ts` crosses 150, `runCall` isn't doing enough; extract more.
- `src/internal/` — shared non-public helpers. Every file here must be used by ≥2 callers. If only one caller, inline it.
- `src/providers/` — one file per provider; `registry.ts` is the only module that knows about all four.
- Barrel (`index.ts`) re-exports in every multi-file directory so external import paths stay stable even when internals move.

### Naming
- **Files:** kebab-case, describe the export (`resolve-use.ts`, `normalize-error.ts`, `log-call.ts`).
- **Exports:** match the file's primary export name. One primary export per file is the default; co-located helpers allowed only if private (not exported from the file).
- **No generic names:** no `utils.ts`, no `helpers.ts`, no `common.ts`, no `shared.ts`. If you're tempted, you haven't named the concept yet.

### TypeScript hygiene
- Zero `any`. Zero `as Type` casting. Zero `@ts-ignore` / `@ts-expect-error`.
- `import type` for type-only imports (required by `verbatimModuleSyntax`).
- Internal imports use `.js` extension (NodeNext requirement).
- Prefer discriminated unions over optional-everything objects.

### Before committing a phase — self-review checklist
The reviewer will check these; you should check them first:
1. Can any file be split without contorting its callers? If yes, split it.
2. Does any two-file pair share ≥10 lines of identical logic? If yes, extract.
3. Does every public export have a clear, single purpose? If not, rename or split.
4. Is there any commented-out code, any `TODO:` without a tracking reference, any `// for now` that's about to ship? Remove or resolve.
5. Would a new contributor understand each file's purpose from its name alone?

---

## Phase Overview

| Phase | Name | Source plan steps | Outcome |
|---|---|---|---|
| 1 | Foundation & Scaffolding | Steps 1–3 | Repo exists on GitHub, all tooling installed, types compiled |
| 2 | Core Wrapper Logic | Steps 4–8 | `defineAI()` returns a typed `ai` object; methods exist as stubs |
| 3 | Methods & Logging | Steps 9–14 | All 5 methods (`text`/`stream`/`object`/`image`/`embed`) functional with mocked AI SDK |
| 4 | React + Next.js Sub-paths | Steps 15–16 | `@xdapps/ai/react` and `@xdapps/ai/next` exports working |
| 5 | Tests, Docs, CI, Release | Steps 17–20 | Full coverage, README/ROADMAP/CHANGELOG, CI/release workflows, **published `0.1.0` on npm** |

---

## Phase 1 — Foundation & Scaffolding

**Source plan steps:** 1, 2, 3 (lines 336–356 in [xdapps-ai-package.md](docs/plans/xdapps-ai-package.md))

**Goal:** Stand up the repo, configure all tooling, write all types, get a clean `typecheck` + `build` pass with zero functional code.

### Actions

> Before writing code, re-read the **Cross-Cutting Standards** section at the top of this doc. File-size budgets, abstraction rules, and naming conventions apply. The reviewer will fail the phase on violations.

1. Create the GitHub repo: `gh repo create XDapps/ai --public --description "Internal LLM wrapper on Vercel AI SDK with use-case profiles"`. Clone is unnecessary — the local directory `/Users/jerry/Documents/code/ai/` already exists; instead `git init`, `git remote add origin git@github.com:XDapps/ai.git` (or https equivalent), then push.
2. Initialize `package.json` (`name: "@xdapps/ai"`, `version: "0.0.0"`, `type: "module"`).
3. Add `LICENSE` (MIT), `.gitignore` (`node_modules`, `dist`, `.env*`, `coverage`), `.npmignore` (`src`, `test`, `tsconfig*`, `vitest.config.ts`, `tsup.config.ts`, `.eslintrc*`).
4. Install dev deps per Step 2 of source plan. **Pin versions to match the Next.js template where overlap exists** (`/Users/jerry/Documents/code/nextjs_template/package.json`): TypeScript ^6, ESLint ^9, Prettier ^3, Vitest ^4, Zod ^4. This keeps both codebases on the same toolchain.
5. Write `tsconfig.json` per source plan Step 2 (`strict: true`, `noUncheckedIndexedAccess: true`, `module: "NodeNext"`, target ES2022, `declaration: true`).
6. Write `tsup.config.ts` with three entry points (`src/index.ts`, `src/react/index.ts`, `src/next/index.ts`), ESM + CJS + `.d.ts`, Node 20 target.
7. Write `package.json` `exports` field with three sub-paths (`.`, `./react`, `./next`), each with `import` / `require` / `types`.
8. Write `vitest.config.ts` (node env for unit tests; jsdom for any React tests in Phase 4 — config can be adjusted then).
9. Write ESLint + Prettier configs aligned to Next.js template style.
10. Add `package.json` scripts: `build`, `dev`, `test`, `test:watch`, `test:integration`, `lint`, `format`, `typecheck`.
11. Write `src/types.ts` with **all** types listed in source plan's "Package API Surface" section (lines 47–158): `Provider`, `Modality`, `UseCase`, `DefineAIConfig`, `CallLog`, `LlmError`, `LlmErrorCode`, `LlmResult`, the `AI<U>` interface, helper utility types (`TextUseKey`, `ImageUseKey`, `EmbedUseKey`).
12. Write `src/index.ts` re-exporting types and a `defineAI` placeholder (signature only — implementation is Phase 2).
13. Initial commit: `chore: scaffold @xdapps/ai package`. Push to `main`.

### Exit Criteria

Structural (must pass):
- Every file in the phase's diff satisfies the Cross-Cutting Standards (file ≤150 lines target, ≤250 hard cap; one concept per file; no `any`/`as`/`@ts-ignore`; no generic-named `utils.ts`/`helpers.ts`).
- No duplication of ≥10 lines between any two files in `src/`.
- The self-review checklist from the Cross-Cutting Standards section has been run and every item is a "yes."

Functional:
- `gh repo view XDapps/ai` returns a public repo.
- `npm install` completes clean.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` produces `dist/` with empty-but-valid `.js` / `.mjs` / `.d.ts` for all three entry points.
- `git log --oneline` shows at least one commit, pushed to `origin/main`.

---

## Phase 2 — Core Wrapper Logic

**Source plan steps:** 4, 5, 6, 7, 8 (lines 358–395 in [xdapps-ai-package.md](docs/plans/xdapps-ai-package.md))

**Goal:** Implement the non-method internals — error normalization, provider registry, config validation, the `defineAI` factory, and the use-case resolver. Methods remain stubs that throw `not implemented` (will land in Phase 3).

### Actions

> Before writing code, re-read the **Cross-Cutting Standards** section at the top of this doc. File-size budgets, abstraction rules, and naming conventions apply. The reviewer will fail the phase on violations.

1. **Step 4** — `src/errors.ts`: `LlmError`, `LlmErrorCode`, `normalizeError(err, provider)` mapping Vercel SDK error classes (`AI_APICallError`, `AI_RateLimitError`, etc.) and HTTP codes to our enum. Unit tests for every mapping.
2. **Step 5** — `src/providers/`:
   - `registry.ts` with `getProvider(p, apiKey)` that dynamically `await import('@ai-sdk/...')` and caches by `(provider, apiKey)`.
   - One file per provider (`anthropic.ts`, `openai.ts`, `google.ts`, `deepseek.ts`) holding the factory call. DeepSeek needs `baseURL` per source plan note.
   - On missing peer dep → return `LlmError({ code: 'MISSING_PROVIDER_PKG' })` with the install hint.
   - In `package.json`, add all four `@ai-sdk/*` packages to `peerDependencies` AND `peerDependenciesMeta` with `{ optional: true }`. Install them as `devDependencies` so the wrapper can typecheck against them.
3. **Step 6** — `src/internal/validate-config.ts`: zod schema for `DefineAIConfig`. Cross-checks: every use-case's `provider` has a matching `apiKeys` entry; modality is one of the three allowed; model string non-empty. Throws `LlmFactoryError` (a thrown subclass of `Error` — startup-time fail-fast, NOT `LlmResult`).
4. **Step 7** — `src/define-ai.ts`: validates config, returns the `ai` object with all five methods bound. Methods throw `not implemented` (placeholder filled in Phase 3).
5. **Step 8** — `src/internal/resolve-use.ts`: `resolveUse(config, useName, modality, callSiteOpts)`. Looks up profile, runtime-checks modality match, merges (call-site wins). Handles the `model: 'provider:modelId'` escape-hatch parse. Returns `{ provider, model, apiKey, ...mergedOpts }` or an `LlmError` for misconfig.
6. Unit tests in `test/unit/` for `errors.test.ts`, `define-ai.test.ts`, `resolve-use.test.ts`. Mock `ai` package with `vi.mock('ai', ...)` per source plan Step 17 guidance.
7. Commit: `feat: implement defineAI factory, error normalization, provider registry, use-case resolver`. Push.

### Exit Criteria

Structural (must pass):
- Every file in the phase's diff satisfies the Cross-Cutting Standards (file ≤150 lines target, ≤250 hard cap; one concept per file; no `any`/`as`/`@ts-ignore`; no generic-named `utils.ts`/`helpers.ts`).
- No duplication of ≥10 lines between any two files in `src/`.
- The self-review checklist from the Cross-Cutting Standards section has been run and every item is a "yes."

Functional:
- `npm test` — all unit tests pass.
- `npm run typecheck` + `npm run lint` pass.
- A throwaway test script can call `defineAI({...})` with a valid config and receive a typed `ai` object back. Calling any method throws `not implemented` (expected at this checkpoint).
- TypeScript compile-time check: `ai.text({ use: 'someImageUse' })` should error if `someImageUse` has `modality: 'image'` (Phase 3 will exercise this for real, but the type plumbing must exist now).
- Commit pushed.

---

## Phase 3 — Methods & Logging

**Source plan steps:** 9, 10, 11, 12, 13, 14 (lines 396–434 in [xdapps-ai-package.md](docs/plans/xdapps-ai-package.md))

**Goal:** Replace the five method stubs with full implementations that wrap Vercel AI SDK and emit logging. After this phase, the package is functionally complete for Node consumers (React/Next sub-paths come in Phase 4).

### Actions

> Before writing code, re-read the **Cross-Cutting Standards** section at the top of this doc. File-size budgets, abstraction rules, and naming conventions apply. The reviewer will fail the phase on violations.

1. **Step 10 (do first — others depend on it)** — `src/internal/log-call.ts`: `logCall({ config, use, provider, model, modality, startTime, result, error? })`. Computes `durationMs`, extracts `inputTokens`/`outputTokens` from Vercel `usage`, dispatches to `config.logger` (info on success, warn on error) and `config.onFinish` (always). **Never throws** — wrap in try/catch internally.
2. **Step 9** — `src/methods/text.ts`: resolve → `getProvider` → Vercel `generateText({ model, messages, temperature, maxTokens, system, tools })`. Try/catch → on error `normalizeError` + `logCall(error)` + return `{ ok: false, error }`. On success `logCall(result)` + return `{ ok: true, text, toolCalls }`.
3. **Step 11** — `src/methods/stream.ts`: same resolution → Vercel `streamText`. Wrap return as `{ textStream, fullStream, toDataStreamResponse() }` — pass-throughs of Vercel's stream object. `logCall` fires inside Vercel's `onFinish` callback. If the initial call throws (pre-stream), return `LlmResult` failure; mid-stream errors flow through Vercel's existing error channel.
4. **Step 12** — `src/methods/object.ts`: Vercel `generateObject({ model, schema, messages, system })`. Returns `{ ok: true, object }` (typed as `z.infer<T>`) or failure.
5. **Step 13** — `src/methods/image.ts`: Vercel `experimental_generateImage` (or whatever the stable export is at build time — **verify via context7 or the installed package's types** before writing). Returns `{ ok: true, images: Array<{ base64, mediaType }> }`.
6. **Step 14** — `src/methods/embed.ts`: Vercel `embedMany({ model, values })`. Returns `{ ok: true, embeddings }`.
7. Wire all five into `src/define-ai.ts`, replacing the Phase 2 stubs.
8. Unit tests in `test/unit/`: `text.test.ts`, `stream.test.ts`, `object.test.ts`, `image.test.ts`, `embed.test.ts`. Mock `ai` package at the boundary (`test/helpers/mock-ai-sdk.ts`) so no network. Cover: success path, every error code mapping, `onFinish` invocation, call-site `system` overrides profile `system`.
9. Commit per method or single `feat: implement text/stream/object/image/embed methods with logging`. Push.

### Exit Criteria

Structural (must pass):
- Every file in the phase's diff satisfies the Cross-Cutting Standards (file ≤150 lines target, ≤250 hard cap; one concept per file; no `any`/`as`/`@ts-ignore`; no generic-named `utils.ts`/`helpers.ts`).
- No duplication of ≥10 lines between any two files in `src/`.
- The self-review checklist from the Cross-Cutting Standards section has been run and every item is a "yes."

Functional:
- `npm test` — all unit tests pass with ≥80% coverage on `src/methods/` and `src/internal/`.
- `npm run typecheck` + `npm run lint` pass.
- Manual smoke test (one-off Node script, deleted after): `defineAI` → `await ai.text(...)` returns `{ ok: true, text: '...' }` against a real Anthropic API key. Run again with a deliberately wrong key → returns `{ ok: false, error: { code: 'AUTH_FAILED' } }`.
- Commit pushed.

---

## Phase 4 — React + Next.js Sub-paths

**Source plan steps:** 15, 16 (lines 436–449 in [xdapps-ai-package.md](docs/plans/xdapps-ai-package.md))

**Goal:** Implement the two sub-path entry points. After this, consumers can both call `ai.text(...)` from server code and use `useAiChat({ use: 'customerChat' })` from React.

### Actions

> Before writing code, re-read the **Cross-Cutting Standards** section at the top of this doc. File-size budgets, abstraction rules, and naming conventions apply. The reviewer will fail the phase on violations.

1. **Step 15** — `src/react/use-ai-chat.ts`: thin wrapper over `@ai-sdk/react`'s `useChat`. Auto-sets `api: \`/api/ai/${use}\``. Add `@ai-sdk/react`, `react`, `react-dom` to optional peer deps. Add `src/react/index.ts` that re-exports the hook.
2. **Step 16** — `src/next/create-chat-route-handler.ts`: `createChatRouteHandler(ai)` returning `async (req, ctx) => Response`. Validates `ctx.params.use`, parses body for `messages`, calls `ai.stream({ use, messages })`, returns `result.toDataStreamResponse()`. On invalid `use` → 400 JSON. On stream error → 500 JSON. Add `src/next/index.ts` re-exporting it.
3. Update `vitest.config.ts` with a jsdom environment override for `test/unit/use-ai-chat.test.ts` (per-file environment via Vitest's `// @vitest-environment jsdom` pragma is fine).
4. Unit tests:
   - `use-ai-chat.test.ts` (jsdom): mocks `@ai-sdk/react`'s `useChat`, asserts `api` is correctly derived from `use`.
   - `create-chat-route-handler.test.ts` (node): mocks the `ai` factory, asserts route returns 400 on bad `use`, 200 + stream on good.
5. Verify `tsup` build output: `dist/react/index.{mjs,js,d.ts}` and `dist/next/index.{mjs,js,d.ts}` all exist and are independently importable.
6. Commit: `feat: add @xdapps/ai/react useAiChat hook and @xdapps/ai/next createChatRouteHandler`. Push.

### Exit Criteria

Structural (must pass):
- Every file in the phase's diff satisfies the Cross-Cutting Standards (file ≤150 lines target, ≤250 hard cap; one concept per file; no `any`/`as`/`@ts-ignore`; no generic-named `utils.ts`/`helpers.ts`).
- No duplication of ≥10 lines between any two files in `src/`.
- The self-review checklist from the Cross-Cutting Standards section has been run and every item is a "yes."

Functional:
- `npm test` passes (including new React/Next tests).
- `npm run build` produces all three entry points in `dist/`.
- A throwaway consumer script can `import { useAiChat } from '@xdapps/ai/react'` and `import { createChatRouteHandler } from '@xdapps/ai/next'` from the built `dist/` without resolution errors.
- Commit pushed.

---

## Phase 5 — Tests, Docs, CI, Release

**Source plan steps:** 17, 18, 19, 20 (lines 451–482 in [xdapps-ai-package.md](docs/plans/xdapps-ai-package.md))

**Goal:** Production-ready: comprehensive tests, complete docs, working CI, and the package **published as `@xdapps/ai@0.1.0` on npm**.

### Actions

> Before writing code, re-read the **Cross-Cutting Standards** section at the top of this doc. File-size budgets, abstraction rules, and naming conventions apply. The reviewer will fail the phase on violations.

1. **Step 17 — Tests:**
   - Backfill any unit-test gaps to hit ≥80% coverage on the whole `src/` tree.
   - Write `test/integration/anthropic.test.ts` (and openai, google, deepseek). Each test makes one real call ("Say 'ok'") and asserts `result.ok === true`. Gate the entire `test/integration/` directory behind `RUN_INTEGRATION=1` env var. Wire `test:integration` script to set it.
2. **Step 18 — Docs:**
   - `README.md`: elevator pitch, install, quick-start, full config reference, all five method examples, React hook + `/api/ai/[use]/route.ts` convention with full Next.js example, error codes reference, provider env-var setup.
   - `ROADMAP.md`: copy the v2+ list verbatim from source plan lines 488–499.
   - `CHANGELOG.md`: stub for `0.1.0` entry — Changesets manages it from here on.
3. **Step 19 — CI:**
   - `.changeset/config.json` — initialize with `npx changeset init`.
   - `.github/workflows/ci.yml`: on PR to `main`, run `lint`, `typecheck`, `test` (unit only, no integration).
   - `.github/workflows/release.yml`: Changesets action — opens version-bump PR, publishes on merge.
   - **User must manually add the `NPM_TOKEN` secret to the GitHub repo before the release workflow can publish.** Include a one-line note in the README under "Maintainer setup."
4. **Step 20 — Initial release:**
   - `npx changeset` → minor bump, description: `Initial release with text/stream/object/image/embed methods, anthropic/openai/google/deepseek providers, React hook, Next.js route handler.`
   - Commit + push the changeset file.
   - Wait for Changesets to open the "Version Packages" PR.
   - Merge the version PR → CI publishes `@xdapps/ai@0.1.0` to npm.
5. Commit: `chore: add tests, docs, CI, and release workflow` (then a follow-up `chore: changeset for 0.1.0`).

### Exit Criteria

Structural (must pass):
- Every file in the phase's diff satisfies the Cross-Cutting Standards (file ≤150 lines target, ≤250 hard cap; one concept per file; no `any`/`as`/`@ts-ignore`; no generic-named `utils.ts`/`helpers.ts`).
- No duplication of ≥10 lines between any two files in `src/`.
- The self-review checklist from the Cross-Cutting Standards section has been run and every item is a "yes."

Functional:
- `npm test` passes with ≥80% coverage.
- `RUN_INTEGRATION=1 npm run test:integration` passes for at least Anthropic + OpenAI (Google/DeepSeek if keys are available).
- `npm run build` clean.
- `gh pr list --repo XDapps/ai` shows no failing CI runs on `main`.
- `npm view @xdapps/ai version` returns `0.1.0`.
- In a fresh throwaway directory: `npm install @xdapps/ai @ai-sdk/anthropic` succeeds; `import { defineAI } from '@xdapps/ai'` resolves.

---

## Final Verification Checklist

(From source plan's "Verification Checklist" — run after Phase 5.)

1. `npm install` in a fresh clone completes clean.
2. `npm run typecheck` passes.
3. `npm run lint` passes.
4. `npm test` — all unit tests pass.
5. `npm run build` produces `dist/` with `.js` / `.mjs` / `.d.ts` for all three entry points.
6. Smoke test: throwaway Node script imports from `./dist/index.mjs`, runs `defineAI` with one Anthropic use case, calls `ai.text(...)`, asserts `result.ok === true`. Repeat with bad API key → `result.ok === false` and `result.error.code === 'AUTH_FAILED'`.
7. Fresh Node project: `npm install @xdapps/ai @ai-sdk/anthropic` + import works.
8. Type-level: `ai.text({ use: 'productImage' })` (where `productImage` is `modality: 'image'`) **fails at compile time**.
9. `RUN_INTEGRATION=1 npm run test:integration` passes for Anthropic + OpenAI.

---

## Critical Files (Source of Truth)

| File | Purpose |
|---|---|
| [docs/plans/xdapps-ai-package.md](docs/plans/xdapps-ai-package.md) | **Authoritative spec.** All API shapes, decisions, error codes, file paths. |
| `/Users/jerry/Documents/code/nextjs_template/package.json` | Toolchain version reference (TypeScript 6, ESLint 9, Vitest 4, Zod 4, Prettier 3). |
| `/Users/jerry/Documents/code/nextjs_template/tsconfig.json` | TS strictness reference (matches `strict: true`, `noUncheckedIndexedAccess: true`). |
| `/Users/jerry/Documents/code/nextjs_template/lib/ai.ts` | The stub this package eventually replaces — reviewed during Phase 5 README writing. |

---

## Out of Scope for All 5 Phases

Per source plan "Out of Scope" section (lines 517–532): no fork of Vercel AI SDK, no providers beyond the four locked, no video/STT/TTS/agents/templating/caching/cost-estimation/Helicone integrations, no `<AiChat />` component, no structured streaming, no external-user onboarding docs. These belong in `ROADMAP.md` only.

## Sequencing With the Next.js Template

After `@xdapps/ai@0.1.0` ships, the Next.js template's [lib/ai.ts](/Users/jerry/Documents/code/nextjs_template/lib/ai.ts) stub gets replaced — that work is **explicitly a separate plan** (per source plan lines 538–542) and not part of these five phases.
