import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000/api'

export default function MarketBar() {
  const [indices, setIndices] = useState([])

  useEffect(() => {
    axios.get(`${API}/indices`)
      .then(res => setIndices(res.data))
      .catch(() => {})
  }, [])

  if (indices.length === 0) return null

  return (
    <div style={{
      background: '#13151f',
      borderBottom: '1px solid var(--border)',
      padding: '8px 24px',
      display: 'flex',
      gap: '32px',
      overflowX: 'auto',
    }}>
      {indices.map(idx => {
        const isPos = idx.change_pct >= 0
        const color = isPos ? 'var(--green)' : 'var(--red)'
        return (
          <div key={idx.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{idx.name}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {idx.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {idx.change_pct != null && (
              <span style={{ fontSize: '12px', color, fontWeight: 600 }}>
                {isPos ? '+' : ''}{idx.change_pct}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
