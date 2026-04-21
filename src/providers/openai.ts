export async function loadOpenAI(apiKey: string) {
  const mod = await import("@ai-sdk/openai")
  return mod.createOpenAI({ apiKey })
}
