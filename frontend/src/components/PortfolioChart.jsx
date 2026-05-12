import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'
const PERIODS = ['1W', '1M', '3M', '6M', '1Y']

function fmt(v) {
  if (v == null) return '—'
  return v >= 0
    ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function CustomTooltip({ active, payload, label, costBasis }) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  const gain = val != null && costBasis ? val - costBasis : null
  const gainPct = gain != null && costBasis > 0 ? (gain / costBasis) * 100 : null
  const isPos = gain >= 0
  return (
    <div style={{
      background: '#1a1f35', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12,
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
        {fmt(val)}
      </p>
      {gain != null && (
        <p style={{ color: isPos ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>
          {isPos ? '+' : ''}{fmt(gain)} ({isPos ? '+' : ''}{gainPct?.toFixed(2)}%)
        </p>
      )}
    </div>
  )
}

export default function PortfolioChart({ holdings }) {
  const [period, setPeriod] = useState('3M')
  const [data, setData] = useState([])
  const [costBasis, setCostBasis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!holdings || holdings.length === 0) return
    setLoading(true)
    setError(null)

    axios.post(`${API}/portfolio/history`, {
      holdings: holdings.map(h => ({
        symbol: h.symbol,
        shares: Number(h.shares),
        buyPrice: Number(h.buyPrice),
      })),
      period: period.toLowerCase(),
    })
      .then(res => {
        setData(res.data.history || [])
        setCostBasis(res.data.cost_basis)
      })
      .catch(() => setError('Could not load portfolio history'))
      .finally(() => setLoading(false))
  }, [holdings, period])

  if (!holdings || holdings.length === 0) return null

  const firstVal = data[0]?.value
  const lastVal = data[data.length - 1]?.value
  const gain = lastVal != null && costBasis ? lastVal - costBasis : null
  const gainPct = gain != null && costBasis > 0 ? (gain / costBasis) * 100 : null
  const isPos = gain == null || gain >= 0

  // Thinned x-axis labels (show max ~6)
  const labelStep = Math.max(1, Math.floor((data.length) / 6))
  const tickFormatter = (val, i) => {
    const idx = data.findIndex(d => d.date === val)
    if (idx % labelStep !== 0) return ''
    // Shorten date
    const parts = val.split('-')
    if (parts.length === 3) return `${parts[1]}/${parts[2]}`
    return val
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '20px 24px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📈 Portfolio Performance</p>
          {lastVal != null && !loading && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 900 }}>{fmt(lastVal)}</span>
              {gain != null && (
                <span style={{ fontSize: 14, fontWeight: 700, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                  {isPos ? '+' : ''}{fmt(gain)} ({isPos ? '+' : ''}{gainPct?.toFixed(2)}%)
                </span>
              )}
            </div>
          )}
          {costBasis && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Cost basis: {fmt(costBasis)}
            </p>
          )}
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '5px 12px', borderRadius: 8, border: 'none',
              background: period === p ? 'var(--accent)' : 'var(--bg-card-hover)',
              color: period === p ? 'white' : 'var(--text-muted)',
              fontSize: 12, fontWeight: period === p ? 700 : 400,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
      ) : error ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>{error}</p>
      ) : data.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPos ? '#22c55e' : '#ef4444'} stopOpacity={0.18} />
                <stop offset="95%" stopColor={isPos ? '#22c55e' : '#ef4444'} stopOpacity={0} />
              </linearGradient>
            </defs>
            {costBasis && (
              <ReferenceLine
                y={costBasis}
                stroke="var(--text-muted)"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: 'Cost', fill: 'var(--text-muted)', fontSize: 10, position: 'insideTopLeft' }}
              />
            )}
            <XAxis
              dataKey="date"
              tickFormatter={tickFormatter}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={46}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip costBasis={costBasis} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isPos ? '#22c55e' : '#ef4444'}
              strokeWidth={2}
              fill="url(#portfolioGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: isPos ? '#22c55e' : '#ef4444' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>No history data available</p>
      )}
    </div>
  )
}
