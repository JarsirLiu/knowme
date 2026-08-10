import type { CSSProperties } from "react";
import styles from "./Orb.module.css";

const STAGE = 28;
const SIZE = 20;
const N = 3;
const PITCH = 6;
const MID = (N - 1) / 2;

const RING: [number, number][] = (() => {
  const ring: [number, number][] = [];
  for (let x = 0; x < N; x++) ring.push([x, 0]);
  for (let y = 1; y < N; y++) ring.push([N - 1, y]);
  for (let x = N - 2; x >= 0; x--) ring.push([x, N - 1]);
  for (let y = N - 2; y >= 1; y--) ring.push([0, y]);
  return ring;
})();

const RING_INDEX = new Map(RING.map(([x, y], i) => [x + "," + y, i]));

function cellDelay(v: OrbVariant, x: number, y: number): number {
  if (v === "S4") {
    // soft column sweep: columns pulse left-to-right
    return x * 320;
  }
  const dx = x - MID;
  const dy = y - MID;
  return Math.hypot(dx, dy) * 700 - (dx === 0 && dy === 0 ? 180 : 0);
}

interface Cell {
  key: string;
  left: number;
  top: number;
  delay: number;
  still: boolean;
  mid: boolean;
}

function latticeCells(variant: OrbVariant): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      cells.push({
        key: x + "," + y,
        left: x * PITCH,
        top: y * PITCH,
        delay: cellDelay(variant, x, y),
        still: false,
        mid: x === MID && y === MID,
      });
    }
  }
  return cells;
}

export type OrbVariant = "S1" | "S4";

export interface OrbProps {
  size?: number;
  label?: string;
  pill?: boolean;
  variant?: OrbVariant;
  className?: string;
  style?: CSSProperties;
}

export function Orb({
  size = SIZE,
  label,
  pill,
  variant = "S1",
  className,
  style,
}: OrbProps) {
  const text = label ?? "执行中…";
  return (
    <span
      className={styles.root + (className ? " " + className : "")}
      data-pill={pill ? "" : undefined}
      style={style}
    >
      <span
        className={styles.glyph}
        role={pill ? undefined : "img"}
        aria-label={pill ? undefined : text}
        aria-hidden={pill ? true : undefined}
        style={
          { width: size, height: size, "--orb-k": size / STAGE } as CSSProperties
        }
      >
        <span className={`${styles.lattice} ${variant === "S4" ? styles.latticeS4 : ""}`}>
          {latticeCells(variant).map((c) => (
            <span
              key={c.key}
              className={styles.cell}
              data-mid={c.mid ? "" : undefined}
              style={
                {
                  left: c.left,
                  top: c.top,
                  animationDelay: c.delay + "ms",
                } as CSSProperties
              }
            />
          ))}
        </span>
      </span>
      {pill && <span className={styles.pillLabel}>{text}</span>}
    </span>
  );
}