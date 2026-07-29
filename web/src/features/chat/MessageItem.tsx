import { useState, type CSSProperties } from "react";
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai";
import { isReasoningUIPart, isToolUIPart } from "ai";

import { IconChevronDown, IconChevronRight } from "@/components/Icons";
import { MarkdownContent } from "./MarkdownContent";
import { ToolCallCompact } from "./ToolCallCompact";
import { ApprovalBanner } from "./ApprovalBanner";

import styles from "./MessageItem.module.css";

type MessageItemProps = {
  message: UIMessage;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

/**
 * 渲染单个消息项。支持 user / assistant / system 角色。
 * 用户消息右对齐、气泡样式；助手消息左对齐、白底带边框。
 */
export function MessageItem({ message, onApprove, onReject }: MessageItemProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // 系统消息 — 居中小标签
  if (isSystem) {
    const text =
      message.parts
        ?.filter(
          (p): p is { type: "text"; text: string } => p.type === "text",
        )
        .map((p) => p.text)
        .join("") ?? "";
    return (
      <div className={styles.systemPill}>
        <span className={styles.systemPillInner}>{text}</span>
      </div>
    );
  }

  // 用户消息
  if (isUser) {
    const text =
      message.parts
        ?.filter(
          (p): p is { type: "text"; text: string } => p.type === "text",
        )
        .map((p) => p.text)
        .join("") ?? "";
    return (
      <div className={styles.userMessage}>
        <div className={styles.userBubble}>{text}</div>
      </div>
    );
  }

  // 助手消息
  return (
    <div className={styles.assistantMessage}>
      {message.parts?.map((part, idx) => (
        <MessagePart
          key={`${message.id}-part-${idx}`}
          part={part}
          index={idx}
          onApprove={onApprove}
          onReject={onReject}
        />
      )) ?? <MarkdownContent text={""} />}
    </div>
  );
}

/**
 * 渲染消息中的一个 part。
 */
function MessagePart({
  part,
  index,
  onApprove,
  onReject,
}: {
  part: UIMessagePart<UIDataTypes, UITools>;
  index: number;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  // 文本
  if (part.type === "text") {
    return (
      <div className={styles.assistantText}>
        <MarkdownContent text={part.text} />
      </div>
    );
  }

  // 推理过程 — 可折叠
  if (isReasoningUIPart(part)) {
    const [open, setOpen] = useState(false);
    return (
      <div className={styles.reasoningCard}>
        <button
          className={styles.reasoningToggle}
          type="button"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconChevronDown /> : <IconChevronRight />}
          <span>思考过程</span>
        </button>
        {open && (
          <div className={styles.reasoningContent}>
            <MarkdownContent text={part.text} />
          </div>
        )}
      </div>
    );
  }

  // 审批
  if (part.type === "tool-approval-request") {
    return <ApprovalBanner part={part} onApprove={onApprove} onReject={onReject} />;
  }

  // 工具调用
  if (isToolUIPart(part) || (part as { type: string }).type === "dynamic-tool") {
    return <ToolCallCompact part={part} />;
  }

  // 数据类 part
  if (part.type.startsWith("data-")) {
    return <div className={styles.dataPart}>{part.type}</div>;
  }

  return null;
}
