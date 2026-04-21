import { DefaultChatTransport } from "ai"
import { useChat } from "@ai-sdk/react"
import type { UseChatOptions, UseChatHelpers } from "@ai-sdk/react"
import type { UIMessage } from "ai"

export type UseAiChatOptions<M extends UIMessage = UIMessage> = Omit<
  UseChatOptions<M>,
  "transport"
> & {
  /** The use-case key defined in your AI config. The hook targets `/api/ai/{use}`. */
  use: string
}

/**
 * Thin wrapper over `@ai-sdk/react`'s `useChat` that auto-sets the API
 * endpoint from the `use` key, routing requests to `/api/ai/{use}`.
 */
export function useAiChat<M extends UIMessage = UIMessage>(
  options: UseAiChatOptions<M>,
): UseChatHelpers<M> {
  const { use, ...rest } = options
  const api = `/api/ai/${use}`

  return useChat<M>({
    ...rest,
    // Inject a DefaultChatTransport so the api URL is always set correctly.
    // DefaultChatTransport is the same transport useChat uses internally when
    // no transport is provided; we're just making the api explicit.
    transport: new DefaultChatTransport({ api }),
  })
}
