/**
 * useAutoScroll — 在给定依赖变化时，将指定元素滚动到底部。
 * 如果用户正在向上滚动则跳过（类似 ChatGPT 的行为）。
 */
import { useEffect, type RefObject } from "react";

export function useAutoScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  deps: unknown[],
): void {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, deps);
}
