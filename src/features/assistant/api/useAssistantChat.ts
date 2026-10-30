import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { isPlusRequired } from '@/shared/lib/errors'
import { isSendable, normalizeQuestion, toRequestMessages, type ChatMessage } from '../domain/chat'
import { askAssistant } from './assistantRepository'

/**
 * The conversation lives only in this hook's state: never persisted, gone when the screen unmounts (and so on
 * sign-out). `send` appends the question and calls insights-chat; `retry` repeats the last question after a failure.
 */
export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const counter = useRef(0)
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
    [isPending, messages, mutate],
  )

  const retry = useCallback(() => {
    if (isPending || messages.at(-1)?.role !== 'user') return
    mutate(messages)
  }, [isPending, messages, mutate])

  const clear = useCallback(() => {
    setMessages([])
    reset()
  }, [reset])

  return {
    messages,
    send,
    retry,
    clear,
    isPending,
    error,
    plusRequired: isPlusRequired(error),
  }
}
