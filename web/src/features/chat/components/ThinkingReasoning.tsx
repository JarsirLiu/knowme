import { useEffect, useState } from "react";
import styles from "./ThinkingReasoning.module.css";
import { ThinkingState } from "./ThinkingState";

interface ThinkingReasoningProps {
  content: string;
  isStreaming: boolean;
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ThinkingReasoning({ content, isStreaming }: ThinkingReasoningProps) {
  const [phase, setPhase] = useState<"thinking" | "done">("thinking");
  const [open, setOpen] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const startTime = useState(Date.now())[0];

  const sentences = splitSentences(content);

  useEffect(() => {
    if (!isStreaming && phase === "thinking") {
      setElapsedS(Math.max(1, Math.round((Date.now() - startTime) / 1000)));
      const timer = setTimeout(() => setPhase("done"), 360);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, phase, startTime]);

  useEffect(() => {
    if (!content && phase === "done") {
      setPhase("thinking");
      setOpen(false);
    }
  }, [content, phase]);

  const done = phase === "done";
  const expanded = done ? open : true;

  const toggle = () => setOpen((o) => !o);

  if (!content && !isStreaming) return null;

  return (
    <div className={styles.tr}>
      <button
        type="button"
        className={styles.trHeader + (done ? " " + styles.isClickable : "")}
        aria-expanded={expanded}
        aria-label="Toggle thought"
        onClick={done ? toggle : undefined}
      >
        {done ? (
          <span className={styles.trLabel}>
            <span className={styles.trVerb}>Thought</span> for <span className={styles.trElapsed}>{elapsedS}</span>s
          </span>
        ) : (
          <span className={styles.trLabel}>
            <ThinkingState />
          </span>
        )}
        {done && (
          <svg className={styles.trChevron} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path d="m4.5 15.75 7.5-7.5 7.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className={styles.trCollapsible + (expanded ? "" : " " + styles.isCollapsed)}>
        <div className={styles.trInner}>
          <div className={styles.trViewport}>
            <div className={styles.trStream}>
              {sentences.map((line, i) => (
                <p key={i} className={styles.trSentence}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}