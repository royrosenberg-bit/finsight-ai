export default function StockHeader({ data }) {
  const isPositive = data.change_pct >= 0
  const changeColor = isPositive ? 'var(--green)' : 'var(--red)'
  const changeSign = isPositive ? '+' : ''

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '24px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '16px',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <span style={{
            background: 'var(--accent)',
            color: 'white',
            padding: '3px 10px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}>
            {data.symbol}
          </span>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {data.name}
          </h1>
        </div>
        {data.sector && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {data.sector} · {data.industry}
          </p>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
          ${data.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        {data.change_pct !== null && (
          <div style={{ fontSize: '16px', color: changeColor, fontWeight: 600, marginTop: '4px' }}>
            {changeSign}{data.change_pct}% today
          </div>
        )}
      </div>
    </div>
  )
}
