import { useState, type CSSProperties } from "react";
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai";
import { getStaticToolName, isToolUIPart } from "ai";

import { IconTerminal, IconFile, IconFileEdit, IconTool, IconCheck, IconX, IconChevronDown, IconChevronRight, IconSearch } from "@/components/Icons";

import styles from "./ToolCallCompact.module.css";

const TOOL_LABELS: Record<string, string> = {
  run_command: "运行命令",
  write_file: "编辑文件",
  read_file: "读取文件",
  search_code: "搜索代码",
  list_files: "列出文件",
  run_npm: "运行 npm",
  glob: "查找文件",
  grep: "搜索内容",
  edit_file: "修改文件",
};

function getToolIcon(name: string) {
  switch (name) {
    case "run_command": return <IconTerminal />;
    case "write_file": case "edit_file": return <IconFileEdit />;
    case "read_file": return <IconFile />;
    case "search_code": return <IconSearch />;
    case "glob": case "grep": return <IconTool />;
    default: return <IconTool />;
  }
}

function extractToolInfo(
  part: UIMessagePart<UIDataTypes, UITools>,
): {
  name: string;
  state: string;
  input: unknown;
  output: unknown;
  error: string;
} {
  if (part.type === "dynamic-tool") {
    return {
      name: part.toolName,
      state: part.state,
      input: part.input,
      output: part.output,
      error: part.errorText ?? "",
    };
  }
  if (isToolUIPart(part)) {
    return {
      name: getStaticToolName(part),
      state: part.state,
      input: (part as { input?: unknown }).input,
      output: (part as { output?: unknown }).output,
      error: (part as { errorText?: string }).errorText ?? "",
    };
  }
  return { name: "", state: "", input: undefined, output: undefined, error: "" };
}

/**
 * 渲染一个工具调用行。默认折叠显示图标 + 标签，点击展开看到输入/输出。
 */
export function ToolCallCompact({ part }: { part: UIMessagePart<UIDataTypes, UITools> }) {
  const [expanded, setExpanded] = useState(false);
  const { name, state, input, output, error } = extractToolInfo(part);

  const isRunning = state === "in-progress" || state === "approval-requested";
  const isSuccess = state === "done" && !error;
  const hasError = !!error;
  const label = `${isRunning ? "正在" : "已"}${TOOL_LABELS[name] ?? "调用工具"}`;

  const hasDetails = input !== undefined || output !== undefined || error;

  // 对于命令类工具，直接展示一行命令摘要
  const commandPreview =
    name === "run_command" && typeof input === "object" && input !== null
      ? String((input as Record<string, unknown>).command ?? "")
      : undefined;

  const iconColor = hasError ? "#c7254e" : isSuccess ? "#22c55e" : "#888";
  const iconBg = hasError ? "#fef2f2" : isSuccess ? "#f0fdf4" : "var(--color-bg-soft)";

  return (
    <div
      className={styles.toolCall}
      onClick={() => hasDetails && setExpanded((v) => !v)}
      style={{
        cursor: hasDetails ? "pointer" : "default",
      }}
    >
      <span className={styles.toolIcon} style={{ background: iconBg }}>
        {getToolIcon(name)}
      </span>
      <span className={styles.toolLabel} style={{ color: iconColor }}>
        {iconColor === "#c7254e" && <IconX style={{ marginRight: 4 }} />}
        {isSuccess && iconColor === "#22c55e" && <IconCheck style={{ marginRight: 4 }} />}
        {label}
      </span>
      {isRunning && <span className={styles.spinner} />}
      {hasDetails && (
        <span className={styles.chevron} style={{ color: "#bbb" }}>
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
      )}

      {commandPreview && !expanded && (
        <span className={styles.commandPreview}>{commandPreview}</span>
      )}

      {expanded && hasDetails && (
        <div className={styles.toolDetail}>
          {input !== undefined && (
            <div className={styles.toolDetailSection}>
              <div className={styles.toolDetailLabel}>Input</div>
              <pre className={styles.toolDetailPre}>
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output !== undefined && (
            <div className={styles.toolDetailSection}>
              <div className={styles.toolDetailLabel}>Output</div>
              <pre className={styles.toolDetailPre}>
                {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
          {error && (
            <div className={styles.toolDetailSection}>
              <div className={styles.toolDetailLabel} style={{ color: "#c7254e" }}>Error</div>
              <pre className={styles.toolDetailPre} style={{ color: "#c7254e" }}>
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
