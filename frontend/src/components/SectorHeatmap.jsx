import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

// Sector icons
const SECTOR_ICONS = {
  'Technology': '💻',
  'Healthcare': '🏥',
  'Financials': '🏦',
  'Consumer Cyclical': '🛍️',
  'Consumer Defensive': '🛒',
  'Industrials': '🏭',
  'Energy': '⚡',
  'Communication Services': '📡',
  'Basic Materials': '⚗️',
  'Utilities': '💡',
  'Real Estate': '🏢',
}

function getColor(pct) {
  if (pct == null) return 'rgba(255,255,255,0.04)'
  if (pct > 2)  return 'rgba(34,197,94,0.30)'
  if (pct > 1)  return 'rgba(34,197,94,0.20)'
  if (pct > 0)  return 'rgba(34,197,94,0.11)'
  if (pct > -1) return 'rgba(239,68,68,0.11)'
  if (pct > -2) return 'rgba(239,68,68,0.20)'
  return 'rgba(239,68,68,0.30)'
}

function getBorderColor(pct) {
  if (pct == null) return 'var(--border)'
  if (pct > 0) return 'rgba(34,197,94,0.25)'
  return 'rgba(239,68,68,0.25)'
}

export default function SectorHeatmap() {
  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/screener`)
      .then(res => {
        const stocks = res.data || []
        // Group by sector, compute avg change_pct and total market cap
        const map = {}
        stocks.forEach(s => {
          const sec = s.sector || 'Other'
          if (!map[sec]) map[sec] = { changes: [], cap: 0, stocks: [] }
          if (s.change_pct != null) map[sec].changes.push(s.change_pct)
          if (s.market_cap) map[sec].cap += s.market_cap
          map[sec].stocks.push(s)
        })
        const result = Object.entries(map).map(([name, d]) => ({
          name,
          change: d.changes.length > 0
            ? parseFloat((d.changes.reduce((a, b) => a + b, 0) / d.changes.length).toFixed(2))
            : null,
          cap: d.cap,
          count: d.stocks.length,
          top: [...d.stocks].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))[0],
        }))
        // Sort by absolute change (biggest movers first)
        result.sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))
        setSectors(result)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>🗺️ Sector Performance</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {[...Array(10)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 76, borderRadius: 10 }} />
          ))}
        </div>
      </div>
    )
  }

  if (sectors.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontWeight: 700, fontSize: 14 }}>🗺️ Sector Performance</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg daily change by sector</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {sectors.map(s => {
          const isPos = s.change == null || s.change >= 0
          return (
            <div key={s.name} style={{
              background: getColor(s.change),
              border: `1px solid ${getBorderColor(s.change)}`,
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'default',
              transition: 'transform 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{ fontSize: 16, marginBottom: 4 }}>
                {SECTOR_ICONS[s.name] || '📊'}
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, lineHeight: 1.2, fontWeight: 500 }}>
                {s.name.replace('Consumer ', 'Cons. ').replace('Communication Services', 'Comm. Svcs')}
              </p>
              <p style={{
                fontSize: 14, fontWeight: 800,
                color: s.change == null ? 'var(--text-muted)' : isPos ? 'var(--green)' : 'var(--red)',
              }}>
                {s.change == null ? '—' : `${isPos ? '+' : ''}${s.change}%`}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {s.count} stocks
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
