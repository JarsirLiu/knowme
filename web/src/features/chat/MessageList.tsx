import type { UIMessage } from "ai";

import { IconSparkles } from "@/components/Icons";
import { MessageItem } from "./MessageItem";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { useTitleExtract } from "./hooks/useTitleExtract";

import styles from "./MessageList.module.css";

type MessageListProps = {
  messages: UIMessage[];
  isLoading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onTitleChange?: (title: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

export function MessageList({
  messages,
  isLoading,
  onApprove,
  onReject,
  onTitleChange,
  scrollRef,
}: MessageListProps) {
  useAutoScroll(scrollRef, [messages]);
  useTitleExtract(messages, onTitleChange);

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.messagesArea} ref={scrollRef}>
      <div className={styles.messagesContainer}>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <LoadingIndicator />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <IconSparkles size={24} />
      </div>
      <div className={styles.emptyTitle}>发送消息开始对话</div>
      <div className={styles.emptyDesc}>
        我可以帮你写代码、改 bug、搜索代码、执行命令……
      </div>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className={styles.loadingIndicator}>
      <div className={styles.loadingBubble}>
        <span className={styles.spinner} />
        思考中…
      </div>
    </div>
  );
}
