import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

const VERDICT_STYLE = {
  Buy:  { bg: '#14532d', border: '#166534', color: '#86efac', icon: '📈' },
  Hold: { bg: '#1c1917', border: '#44403c', color: '#d6d3d1', icon: '⏸️' },
  Sell: { bg: '#450a0a', border: '#7f1d1d', color: '#fca5a5', icon: '📉' },
}

const CONFIDENCE_COLOR = {
  High: '#22c55e',
  Medium: '#f59e0b',
  Low: '#94a3b8',
}

export default function AIRecommendation({ symbol }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null)
    setLoading(true)
    setError(null)
    axios.get(`${API}/recommend/${symbol}`)
      .then(res => setData(res.data))
      .catch(() => setError('Could not load AI recommendation'))
      .finally(() => setLoading(false))
  }, [symbol])

  const style = data ? (VERDICT_STYLE[data.verdict] || VERDICT_STYLE.Hold) : null

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '20px 24px',
    }}>
      <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px' }}>
        AI Recommendation
      </h2>

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Analyzing with Claude AI...
        </div>
      )}

      {error && (
        <div style={{ color: '#fca5a5', fontSize: '14px' }}>{error}</div>
      )}

      {data && style && (
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: style.bg,
            border: `1px solid ${style.border}`,
            borderRadius: '10px',
            padding: '8px 16px',
            marginBottom: '12px',
          }}>
            <span style={{ fontSize: '18px' }}>{style.icon}</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: style.color }}>{data.verdict}</span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Confidence: </span>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: CONFIDENCE_COLOR[data.confidence] || 'var(--text-secondary)',
            }}>
              {data.confidence}
            </span>
          </div>

          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}>
            {data.reasoning}
          </p>
        </div>
      )}
    </div>
  )
}
