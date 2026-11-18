import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import type { DraftMovement } from '@/features/ai/domain/draft'
import { isPlusRequired } from '@/shared/lib/errors'
import { isSendable, normalizeQuestion, toRequestMessages, type ChatMessage } from '../domain/chat'
import { askAssistant } from './assistantRepository'

/**
 * Conversations kept in memory while the app is open, so closing the chat sheet and opening it again does not lose it.
 * Never written to storage: a reload or "Cerrar sesión" (`clearAssistantMemory`) empties it.
 */
const memory = new Map<string, ChatMessage[]>()

export function clearAssistantMemory(): void {
  memory.clear()
}

/**
 * The conversation: never persisted to storage (the Asistente page loses it when it unmounts; the chat sheet keeps it in
 * memory under `memoryKey`). `send` appends the question and calls insights-chat; `retry` repeats the last question.
 */
export function useAssistantChat(memoryKey?: string) {
  const [messages, setMessagesState] = useState<ChatMessage[]>(() => (memoryKey ? (memory.get(memoryKey) ?? []) : []))
  const latest = useRef(messages)
  // Written outside the state updater, so a reply that arrives after the sheet closed still lands in the memory.
  const setMessages = useCallback(
    (update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => {
      const next = typeof update === 'function' ? update(latest.current) : update
      latest.current = next
      if (memoryKey) memory.set(memoryKey, next)
      setMessagesState(next)
    },
    [memoryKey],
  )
  const counter = useRef(messages.length)
  const nextId = () => `m${++counter.current}`

  const mutation = useMutation({
    mutationFn: (history: ChatMessage[]) => askAssistant(toRequestMessages(history)),
    onSuccess: (reply) =>
      setMessages((current) => [...current, { id: nextId(), role: 'assistant', content: reply }]),
  })
  const { mutate, isPending, error, reset } = mutation

  const send = useCallback(
    (text: string) => {
      if (isPending || !isSendable(text)) return false
      const next: ChatMessage[] = [
        ...messages,
        { id: nextId(), role: 'user', content: normalizeQuestion(text) },
      ]
      setMessages(next)
      mutate(next)
      return true
    },
    [isPending, messages, mutate, setMessages],
  )

  const retry = useCallback(() => {
    if (isPending || messages.at(-1)?.role !== 'user') return
    mutate(messages)
  }, [isPending, messages, mutate])

  /** Adds a message without asking the assistant (a movement written in the chat, and Moni's reading of it). */
  const append = useCallback((role: ChatMessage['role'], content: string, drafts?: DraftMovement[]) => {
    setMessages((current) => [...current, { id: nextId(), role, content, drafts }])
  }, [setMessages])

  const clear = useCallback(() => {
    setMessages([])
    reset()
  }, [reset, setMessages])

  return {
    messages,
    send,
    append,
    retry,
    clear,
    isPending,
    error,
    plusRequired: isPlusRequired(error),
  }
}
