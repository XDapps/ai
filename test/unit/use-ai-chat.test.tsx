// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseChat, mockDefaultChatTransport } = vi.hoisted(() => {
  return {
    mockUseChat: vi.fn(),
    mockDefaultChatTransport: vi.fn(),
  }
})

vi.mock("@ai-sdk/react", () => ({
  useChat: mockUseChat,
}))

vi.mock("ai", () => ({
  DefaultChatTransport: mockDefaultChatTransport,
}))

// ---------------------------------------------------------------------------
// Subject — imported after mocks are in place
// ---------------------------------------------------------------------------

import { useAiChat } from "../../src/react/use-ai-chat.js"

const MOCK_RETURN = {
  id: "chat-1",
  messages: [],
  status: "ready" as const,
  error: undefined,
  sendMessage: vi.fn(),
  regenerate: vi.fn(),
  stop: vi.fn(),
  resumeStream: vi.fn(),
  addToolResult: vi.fn(),
  addToolOutput: vi.fn(),
  addToolApprovalResponse: vi.fn(),
  setMessages: vi.fn(),
  clearError: vi.fn(),
}

beforeEach(() => {
  mockUseChat.mockReset()
  mockDefaultChatTransport.mockReset()
  mockUseChat.mockReturnValue(MOCK_RETURN)
  // DefaultChatTransport is called with `new`, so the constructor should
  // return a plain object that acts as the transport instance.
  mockDefaultChatTransport.mockImplementation(function (opts: { api?: string }) {
    return { api: opts.api, __marker: "t" }
  })
})

describe("useAiChat()", () => {
  it("calls useChat with api derived from the use key", () => {
    renderHook(() => useAiChat({ use: "customerChat" }))

    expect(mockUseChat).toHaveBeenCalledOnce()
    const callArg: unknown = mockUseChat.mock.calls[0]?.[0]
    expect(callArg).toBeDefined()

    // The transport passed to useChat should have been constructed with the correct api.
    expect(mockDefaultChatTransport).toHaveBeenCalledWith({ api: "/api/ai/customerChat" })
  })

  it("passes additional options through to useChat", () => {
    const initialMessages = [
      { role: "user" as const, content: "hello", id: "m1", parts: [] },
    ]
    renderHook(() => useAiChat({ use: "customerChat", messages: initialMessages }))

    expect(mockUseChat).toHaveBeenCalledOnce()
    expect(mockUseChat).toHaveBeenCalledWith(
      expect.objectContaining({ messages: initialMessages }),
    )
  })

  it("returns whatever useChat returns", () => {
    const { result } = renderHook(() => useAiChat({ use: "customerChat" }))
    expect(result.current).toBe(MOCK_RETURN)
  })

  it("forwards the constructed transport to useChat", () => {
    renderHook(() => useAiChat({ use: "customerChat" }))

    expect(mockUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ __marker: "t", api: "/api/ai/customerChat" }),
      }),
    )
  })
})
