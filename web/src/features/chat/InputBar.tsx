import { useState } from "react";

import { IconPlus, IconSend, IconStop } from "@/components/Icons";

import styles from "./InputBar.module.css";

type InputBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading: boolean;
  placeholder?: string;
};

/**
 * 输入栏 — 居中、带阴影、圆角胶囊风格，参考 Codex 的输入框设计。
 * 支持 Enter 发送 / Shift+Enter 换行。
 */
export function InputBar({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  placeholder = "随心输入…",
}: InputBarProps) {
  const [focused, setFocused] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSend();
    }
  };

  const handleSend = () => {
    if (value.trim()) {
      onSend();
    }
  };

  return (
    <div className={styles.inputBarWrap}>
      <div
        className={[styles.inputBar, focused && styles.inputBarFocused].filter(Boolean).join(" ")}
      >
        <button
          className={styles.plusButton}
          type="button"
          title="添加附件"
        >
          <IconPlus />
        </button>
        <textarea
          className={styles.inputTextarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        <button
          className={[
            styles.sendButton,
            isLoading ? styles.sendButtonStop : value.trim() ? styles.sendButtonActive : styles.sendButtonDisabled,
          ].filter(Boolean).join(" ")}
          type="button"
          disabled={!value.trim()}
          onClick={() => isLoading && onStop ? onStop() : handleSend()}
          title={isLoading ? "停止生成" : "发送"}
        >
          {isLoading && onStop ? <IconStop size={16} /> : <IconSend />}
        </button>
      </div>
      <div className={styles.inputBarHint}>
        <span>按 Enter 发送，Shift+Enter 换行</span>
      </div>
    </div>
  );
}
