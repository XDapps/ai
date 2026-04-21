export async function loadGoogle(apiKey: string) {
  const mod = await import("@ai-sdk/google")
  return mod.createGoogleGenerativeAI({ apiKey })
}
