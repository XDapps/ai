import type { Provider } from "../types/providers.js"

// Single source of truth for all recognised provider identifiers.
const PROVIDERS = new Set<string>(["anthropic", "openai", "google", "deepseek"])

export function isProvider(value: string): value is Provider {
  return PROVIDERS.has(value)
}
