export async function loadAnthropic(apiKey: string) {
  const mod = await import("@ai-sdk/anthropic")
  return mod.createAnthropic({ apiKey })
}
