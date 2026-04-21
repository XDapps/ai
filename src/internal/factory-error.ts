export class LlmFactoryError extends Error {
  readonly issues: string[]

  constructor(message: string, issues: string[] = []) {
    super(message)
    this.name = "LlmFactoryError"
    this.issues = issues
  }
}
