import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import axios from 'axios'

const API = 'http://localhost:8000/api'

const PERIODS = ['1D', '5D', '1W', '1M', '3M', '6M', '1Y']

export default function StockChart({ symbol }) {
  const [period, setPeriod] = useState('3M')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    axios.get(`${API}/history/${symbol}?period=${period.toLowerCase()}`)
      .then(res => setData(res.data.history || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [symbol, period])

  const firstClose = data[0]?.close
  const lastClose = data[data.length - 1]?.close
  const changePct = firstClose && lastClose ? ((lastClose - firstClose) / firstClose * 100) : null
  const isPositive = changePct >= 0
  const color = isPositive ? '#22c55e' : '#ef4444'

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return (
        <div style={{
          background: '#1e2235',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '13px',
        }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</p>
          <p style={{ color, fontWeight: 600 }}>${payload[0].value?.toFixed(2)}</p>
        </div>
      )
    }
    return null
  }

  const tickInterval = Math.max(1, Math.floor(data.length / 5))

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Price History — {symbol}
          </h2>
          {!loading && changePct !== null && (
            <span style={{
              fontSize: '14px',
              fontWeight: 700,
              color,
              background: isPositive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              padding: '3px 10px',
              borderRadius: '20px',
            }}>
              {isPositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '5px 10px',
                borderRadius: '8px',
                border: 'none',
                background: period === p ? 'var(--accent)' : 'var(--bg-card-hover)',
                color: period === p ? 'white' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          Loading chart...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              interval={tickInterval}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `$${v}`}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke={color}
              strokeWidth={2}
              fill="url(#colorGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
