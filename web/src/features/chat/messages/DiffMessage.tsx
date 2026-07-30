interface DiffMessageProps {
  diffs: Array<{
    path: string
    additions: number
    deletions: number
    patch?: string
  }>
}

export function DiffMessage({ diffs }: DiffMessageProps) {
  if (!diffs || diffs.length === 0) return null

  return (
    <div className="diff-message">
      <div className="diff-header">
        <span className="diff-icon">📝</span>
        <span>修改了 {diffs.length} 个文件</span>
      </div>
      <div className="diff-list">
        {diffs.map((diff, i) => (
          <div key={i} className="diff-item">
            <span className="diff-path">{diff.path}</span>
            <span className="diff-stats">
              <span className="diff-additions">+{diff.additions}</span>
              <span className="diff-deletions">-{diff.deletions}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
