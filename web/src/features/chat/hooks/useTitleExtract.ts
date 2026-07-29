/**
 * useTitleExtract — 首次收到用户消息时提取一次标题。
 * 返回一个 ref（初始 false），在 titleRef.current === true 时已提取。
 */
import { useRef, useEffect } from "react";
import type { UIMessage } from "ai";

export function useTitleExtract(
  messages: UIMessage[],
  onTitleChange?: (title: string) => void,
): void {
  const ref = useRef(false);

  useEffect(() => {
    if (!onTitleChange || ref.current || messages.length === 0) return;

    const first = messages.find((m) => m.role === "user");
    if (!first) return;

    ref.current = true;
    const text =
      first.parts?.find((p) => p.type === "text")?.text ?? "";
    onTitleChange(text.slice(0, 30).trim() || "新对话");
  }, [messages, onTitleChange]);
}
