export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton width="40%" height={14} />
      <Skeleton width="60%" height={28} />
      <Skeleton width="30%" height={12} />
    </div>
  )
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '6px 0' }}>
          <Skeleton width={60} height={14} />
          <Skeleton width={140} height={14} />
          <Skeleton width={70} height={14} style={{ marginLeft: 'auto' }} />
          <Skeleton width={60} height={14} />
        </div>
      ))}
    </div>
  )
}
