export async function loadDeepSeek(apiKey: string) {
  const mod = await import("@ai-sdk/deepseek")
  return mod.createDeepSeek({ apiKey })
}
