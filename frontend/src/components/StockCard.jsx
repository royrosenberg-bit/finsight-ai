export default function StockCard({ data, onClick }) {
  const isPos = data.change_pct >= 0
  const color = isPos ? 'var(--green)' : 'var(--red)'
  const bgColor = isPos ? 'var(--green-dim)' : 'var(--red-dim)'

  return (
    <div
      className="fade-in"
      onClick={() => onClick && onClick(data.symbol)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.background = 'var(--bg-card-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'var(--bg-card)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          background: 'var(--accent-dim)', color: 'var(--accent-light)',
          padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
        }}>
          {data.symbol}
        </span>
        {data.change_pct != null && (
          <span style={{
            background: bgColor, color, padding: '3px 8px',
            borderRadius: '6px', fontSize: '12px', fontWeight: 700,
          }}>
            {isPos ? '+' : ''}{data.change_pct}%
          </span>
        )}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
        {data.name?.length > 22 ? data.name.slice(0, 22) + '…' : data.name}
      </p>
      <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
        ${data.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  )
}
