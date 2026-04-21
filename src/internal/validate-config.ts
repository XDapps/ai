import { z } from "zod"
import type { DefineAIConfig, UseCase } from "../types/index.js"
import { LlmFactoryError } from "./factory-error.js"

const providerSchema = z.enum(["anthropic", "openai", "google", "deepseek"])

const textUseCaseSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  modality: z.literal("text"),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  system: z.string().optional(),
})

const imageUseCaseSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  modality: z.literal("image"),
  size: z.string().optional(),
  quality: z.string().optional(),
})

const embedUseCaseSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  modality: z.literal("embed"),
})

const useCaseSchema = z.discriminatedUnion("modality", [
  textUseCaseSchema,
  imageUseCaseSchema,
  embedUseCaseSchema,
])

const apiKeysSchema = z.object({
  anthropic: z.string().min(1).optional(),
  openai: z.string().min(1).optional(),
  google: z.string().min(1).optional(),
  deepseek: z.string().min(1).optional(),
})

const defineAIConfigSchema = z.object({
  use: z.record(z.string(), useCaseSchema),
  apiKeys: apiKeysSchema,
})

function crossValidate(config: DefineAIConfig<Record<string, UseCase>>): string[] {
  const issues: string[] = []

  for (const [name, useCase] of Object.entries(config.use)) {
    const hasKey = config.apiKeys[useCase.provider] !== undefined
    if (!hasKey) {
      issues.push(
        `Use case '${name}' requires provider '${useCase.provider}' but no API key was provided for it.`,
      )
    }
  }

  return issues
}

export function validateConfig(
  config: DefineAIConfig<Record<string, UseCase>>,
): void {
  const result = defineAIConfigSchema.safeParse(config)

  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message)
    throw new LlmFactoryError("Invalid defineAI config.", issues)
  }

  const crossIssues = crossValidate(config)
  if (crossIssues.length > 0) {
    throw new LlmFactoryError("Invalid defineAI config.", crossIssues)
  }
}
