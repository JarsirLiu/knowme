import styles from './DiffMessage.module.css'

type DiffRow = {
  old: number | null
  cur: number | null
  type: 'ctx' | 'del' | 'add'
  text: string
}

interface DiffEntry {
  path: string
  additions: number
  deletions: number
  patch?: string
}

interface DiffMessageProps {
  diffs: Array<DiffEntry>
}

function parsePatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of patch.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const hunk = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      continue
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) continue
    if (line.startsWith(' ')) {
      rows.push({ old: oldLine++, cur: newLine++, type: 'ctx', text: line.slice(1) })
    } else if (line.startsWith('-')) {
      rows.push({ old: oldLine++, cur: null, type: 'del', text: line.slice(1) })
    } else if (line.startsWith('+')) {
      rows.push({ old: null, cur: newLine++, type: 'add', text: line.slice(1) })
    }
  }
  return rows
}

function FileDiff({ file, additions, deletions, rows }: { file: string; additions: number; deletions: number; rows: DiffRow[] }) {
  const added = rows.filter((r) => r.type === 'add').length
  const removed = rows.filter((r) => r.type === 'del').length
  return (
    <div className={styles.diff}>
      <div className={styles.diffHead}>
        <span className={styles.diffFileWrap}>
          <svg className={styles.diffIcon} viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.diffFile}>{file}</span>
        </span>
        <span className={styles.diffStat}>
          <span className={styles.add}>{rows.length ? `+${added}` : `+${additions}`}</span>
          <span className={styles.del}>{rows.length ? `-${removed}` : `-${deletions}`}</span>
        </span>
      </div>
      {rows.length > 0 && (
        <div className={styles.diffBody}>
          {rows.map((r, i) => (
            <div key={i} className={styles.diffRow + ' ' + styles[r.type]}>
              <span className={styles.ln + ' ' + styles.old}>{r.old ?? ''}</span>
              <span className={styles.ln + ' ' + styles.new}>{r.cur ?? ''}</span>
              <span className={styles.sign}>
                {r.type === 'add' ? '+' : r.type === 'del' ? '-' : ''}
              </span>
              <code>{r.text}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DiffMessage({ diffs }: DiffMessageProps) {
  if (!diffs || diffs.length === 0) return null

  return (
    <div>
      {diffs.map((diff, i) => (
        <FileDiff
          key={i}
          file={diff.path}
          additions={diff.additions}
          deletions={diff.deletions}
          rows={diff.patch ? parsePatch(diff.patch) : []}
        />
      ))}
    </div>
  )
}