import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000/api'

export default function AnalystRatings({ symbol }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setData(null)
    setLoading(true)
    axios.get(`${API}/analysts/${symbol}`)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px' }}>
      <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>Analyst Ratings</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading...</p>
    </div>
  )

  if (!data) return null

  const total = (data.strong_buy || 0) + (data.buy || 0) + (data.hold || 0) + (data.sell || 0) + (data.strong_sell || 0)

  const bars = [
    { label: 'Strong Buy', value: data.strong_buy || 0, color: '#16a34a' },
    { label: 'Buy', value: data.buy || 0, color: '#22c55e' },
    { label: 'Hold', value: data.hold || 0, color: '#f59e0b' },
    { label: 'Sell', value: data.sell || 0, color: '#ef4444' },
    { label: 'Strong Sell', value: data.strong_sell || 0, color: '#b91c1c' },
  ]

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>Analyst Ratings</h2>
        {data.target_price && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Price Target</p>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-light)' }}>${data.target_price}</p>
          </div>
        )}
      </div>

      {total > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '8px', marginBottom: '12px' }}>
            {bars.filter(b => b.value > 0).map(b => (
              <div key={b.label} style={{ width: `${(b.value / total) * 100}%`, background: b.color }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {bars.filter(b => b.value > 0).map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1 }}>{b.label}</span>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{b.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recommendation && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Consensus: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{data.recommendation}</span>
          {total > 0 && <span> ({total} analysts)</span>}
        </p>
      )}
    </div>
  )
}
