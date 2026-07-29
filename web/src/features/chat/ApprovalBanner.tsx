import { IconCheck, IconX } from "@/components/Icons";

import styles from "./ApprovalBanner.module.css";
import type { UIMessagePart, UIDataTypes, UITools } from "ai";

/**
 * 审批条 — 当工具需要用户审批时显示。
 */
export function ApprovalBanner({
  part,
  onApprove,
  onReject,
}: {
  part: UIMessagePart<UIDataTypes, UITools>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const approvalId = String(
    (part as Record<string, unknown>).approvalId ??
      (part as Record<string, unknown>).toolCallId ??
      "",
  );
  if (!approvalId) return null;

  return (
    <div className={styles.approval}>
      <div className={styles.approvalTitle}>
        需要审批：工具调用 {(part as Record<string, unknown>).toolCallId as string}
      </div>
      <div className={styles.approvalActions}>
        <button
          type="button"
          className={styles.approvalApprove}
          onClick={() => onApprove(approvalId)}
        >
          <IconCheck style={{ marginRight: 4 }} />
          批准
        </button>
        <button
          type="button"
          className={styles.approvalReject}
          onClick={() => onReject(approvalId)}
        >
          <IconX style={{ marginRight: 4 }} />
          拒绝
        </button>
      </div>
    </div>
  );
}
