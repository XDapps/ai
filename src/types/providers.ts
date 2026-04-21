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
