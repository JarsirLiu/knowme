import { ThinkingReasoning } from '../components/ThinkingReasoning'

interface ReasoningMessageProps {
  content: string
  isStreaming: boolean
}

export function ReasoningMessage({ content, isStreaming }: ReasoningMessageProps) {
  return <ThinkingReasoning content={content} isStreaming={isStreaming} />
}