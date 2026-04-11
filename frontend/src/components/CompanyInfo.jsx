function formatMarketCap(val) {
  if (!val) return 'N/A'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  return `$${val.toLocaleString()}`
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{value ?? 'N/A'}</span>
    </div>
  )
}

export default function CompanyInfo({ data }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '20px 24px',
    }}>
      <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
        Company Stats
      </h2>
      <Row label="Market Cap" value={formatMarketCap(data.market_cap)} />
      <Row label="P/E Ratio" value={data.pe_ratio ? data.pe_ratio.toFixed(2) : null} />
      <Row label="52-Week High" value={data.week_52_high ? `$${data.week_52_high.toFixed(2)}` : null} />
      <Row label="52-Week Low" value={data.week_52_low ? `$${data.week_52_low.toFixed(2)}` : null} />
      <Row label="Sector" value={data.sector} />
      <Row label="Industry" value={data.industry} />
    </div>
  )
}
