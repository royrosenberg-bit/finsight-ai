import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444']
const PERIODS = ['1W', '1M', '3M', '6M', '1Y']

function fmt(val, type) {
  if (val == null || val === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  switch (type) {
    case 'pct':   return `${(val * 100).toFixed(1)}%`
    case 'price': return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'cap':   return val >= 1e12 ? `$${(val / 1e12).toFixed(2)}T` : val >= 1e9 ? `$${(val / 1e9).toFixed(1)}B` : `$${(val / 1e6).toFixed(0)}M`
    case 'num':   return val.toFixed(2)
    default:      return String(val)
  }
}

const METRICS = [
  { key: 'price',          label: 'Price',            type: 'price', lower: false },
  { key: 'change_pct',     label: 'Today',            type: 'num',   lower: false, suffix: '%' },
  { key: 'market_cap',     label: 'Market Cap',       type: 'cap',   lower: false },
  { key: 'pe_ratio',       label: 'P/E Ratio',        type: 'num',   lower: true  },
  { key: 'forward_pe',     label: 'Forward P/E',      type: 'num',   lower: true  },
  { key: 'ps_ratio',       label: 'P/S Ratio',        type: 'num',   lower: true  },
  { key: 'pb_ratio',       label: 'P/B Ratio',        type: 'num',   lower: true  },
  { key: 'revenue_growth', label: 'Revenue Growth',   type: 'pct',   lower: false },
  { key: 'earnings_growth',label: 'Earnings Growth',  type: 'pct',   lower: false },
  { key: 'gross_margin',   label: 'Gross Margin',     type: 'pct',   lower: false },
  { key: 'profit_margin',  label: 'Profit Margin',    type: 'pct',   lower: false },
  { key: 'roe',            label: 'ROE',              type: 'pct',   lower: false },
  { key: 'debt_to_equity', label: 'Debt / Equity',    type: 'num',   lower: true  },
  { key: 'current_ratio',  label: 'Current Ratio',    type: 'num',   lower: false },
  { key: 'dividend_yield', label: 'Dividend Yield',   type: 'pct',   lower: false },
  { key: 'beta',           label: 'Beta',             type: 'num',   lower: true  },
  { key: 'week_52_high',   label: '52W High',         type: 'price', lower: false },
  { key: 'week_52_low',    label: '52W Low',          type: 'price', lower: false },
]

function WinnerBadge({ isWinner }) {
  if (!isWinner) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
      marginLeft: 6,
    }}>BEST</span>
  )
}

const RISK_ICON = { stronger_growth: '🚀', better_value: '💰', lower_risk: '🛡️' }
const RISK_LABEL = { stronger_growth: 'Stronger Growth', better_value: 'Better Value', lower_risk: 'Lower Risk' }

export default function CompareStocks() {
  const [symbols, setSymbols] = useState([])
  const [input, setInput] = useState('')
  const [chartData, setChartData] = useState([])
  const [period, setPeriod] = useState('3M')
  const [loading, setLoading] = useState(false)
  const [addError, setAddError] = useState(null)
  const [stockInfo, setStockInfo] = useState({})
  const [fundamentals, setFundamentals] = useState(null)
  const [fundLoading, setFundLoading] = useState(false)
  const [tab, setTab] = useState('chart')

  async function fetchChartData(syms, per) {
    if (syms.length === 0) { setChartData([]); return }
    setLoading(true)
    try {
      const results = await Promise.all(
        syms.map(sym => axios.get(`${API}/history/${sym}?period=${per.toLowerCase()}`))
      )
      const merged = {}
      results.forEach((res, i) => {
        const hist = res.data.history || []
        // Use first valid (non-zero) close as the base for normalization
        const firstValid = hist.find(p => p.close && p.close > 0)
        const base = firstValid?.close || 1
        hist.forEach(point => {
          if (!merged[point.date]) merged[point.date] = { date: point.date }
          merged[point.date][syms[i]] = parseFloat(((point.close - base) / base * 100).toFixed(2))
        })
      })
      setChartData(Object.values(merged))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchFundamentals(syms) {
    if (syms.length < 2) return
    setFundLoading(true)
    try {
      const res = await axios.get(`${API}/compare/fundamentals?symbols=${syms.join(',')}`)
      setFundamentals(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setFundLoading(false)
    }
  }

  async function addSymbol(e) {
    e.preventDefault()
    setAddError(null)
    const sym = input.trim().toUpperCase()
    if (!sym) return
    if (symbols.includes(sym)) return setAddError(`${sym} is already in the comparison.`)
    if (symbols.length >= 4) return setAddError('Maximum 4 stocks can be compared at once.')
    if (!/^[A-Z]{1,5}$/.test(sym)) return setAddError(`"${sym}" doesn't look like a valid ticker.`)
    try {
      const res = await axios.get(`${API}/stock/${sym}`)
      const newSymbols = [...symbols, sym]
      setSymbols(newSymbols)
      setStockInfo(prev => ({ ...prev, [sym]: res.data }))
      setInput('')
      fetchChartData(newSymbols, period)
      if (newSymbols.length >= 2) fetchFundamentals(newSymbols)
    } catch {
      setAddError(`Symbol "${sym}" not found. Check the ticker and try again.`)
    }
  }

  function removeSymbol(sym) {
    const newSymbols = symbols.filter(s => s !== sym)
    setSymbols(newSymbols)
    setStockInfo(prev => { const p = { ...prev }; delete p[sym]; return p })
    fetchChartData(newSymbols, period)
    if (newSymbols.length >= 2) fetchFundamentals(newSymbols)
    else setFundamentals(null)
  }

  function changePeriod(p) {
    setPeriod(p)
    fetchChartData(symbols, p)
  }

  const tickInterval = Math.max(1, Math.floor(chartData.length / 5))

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)' }}>
        📊 Compare Stocks
      </h2>

      {/* Add symbol */}
      <form onSubmit={addSymbol} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setAddError(null) }}
            placeholder={symbols.length >= 4 ? 'Max 4 stocks reached' : 'Add symbol (e.g. MSFT)'}
            disabled={symbols.length >= 4}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10,
              border: `1px solid ${addError ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`, background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = addError ? 'rgba(239,68,68,0.5)' : 'var(--border)'}
          />
          <button type="submit" disabled={symbols.length >= 4} style={{
            padding: '12px 20px', borderRadius: 10, border: 'none',
            background: symbols.length >= 4 ? 'var(--bg-card-hover)' : 'var(--accent)',
            color: symbols.length >= 4 ? 'var(--text-muted)' : 'white',
            fontWeight: 600, cursor: symbols.length >= 4 ? 'not-allowed' : 'pointer',
          }}>Add</button>
        </div>
        {addError && (
          <p style={{ fontSize: 12, color: '#fca5a5', paddingLeft: 4 }}>{addError}</p>
        )}
      </form>

      {/* Stock chips */}
      {symbols.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {symbols.map((sym, i) => (
            <div key={sym} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-card)', border: `1px solid ${COLORS[i]}`,
              borderRadius: 20, padding: '6px 14px',
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i], display: 'inline-block' }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: COLORS[i] }}>{sym}</span>
              {stockInfo[sym] && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>${stockInfo[sym].price}</span>
              )}
              <button onClick={() => removeSymbol(sym)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 12, padding: 0,
              }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {symbols.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 6 }}>Add 2+ stocks to compare</p>
          <p style={{ fontSize: 13 }}>See price performance & fundamentals side by side</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tabs (only show when fundamentals available) */}
          {symbols.length >= 2 && (
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
              {['chart', 'fundamentals'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '8px 20px', borderRadius: 9, border: 'none',
                  background: tab === t ? 'var(--accent)' : 'transparent',
                  color: tab === t ? 'white' : 'var(--text-muted)',
                  fontWeight: tab === t ? 600 : 400, cursor: 'pointer', fontSize: 13,
                }}>
                  {t === 'chart' ? '📈 Price Chart' : '🔬 Fundamentals'}
                </button>
              ))}
            </div>
          )}

          {/* Chart tab */}
          {tab === 'chart' && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>% Change (normalized from start)</p>
                <div style={{ display: 'flex', gap: 5 }}>
                  {PERIODS.map(p => (
                    <button key={p} onClick={() => changePeriod(p)} style={{
                      padding: '5px 10px', borderRadius: 8, border: 'none',
                      background: period === p ? 'var(--accent)' : 'var(--bg-card-hover)',
                      color: period === p ? 'white' : 'var(--text-muted)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>{p}</button>
                  ))}
                </div>
              </div>
              {loading ? (
                <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="date" interval={tickInterval} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={50} />
                    <Tooltip formatter={(val) => `${val}%`} contentStyle={{ background: '#1e2235', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    {symbols.map((sym, i) => (
                      <Line key={sym} type="monotone" dataKey={sym} stroke={COLORS[i]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Fundamentals tab */}
          {tab === 'fundamentals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {fundLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 48, borderRadius: 10 }} />)}
                </div>
              ) : fundamentals ? (
                <>
                  {/* AI Summary */}
                  {fundamentals.ai?.summary && (
                    <div style={{
                      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 16, padding: 20,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 15 }}>✨</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>AI Comparison</span>
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        {fundamentals.ai.summary}
                      </p>
                      {fundamentals.ai.verdict && (
                        <div style={{
                          padding: '10px 14px', borderRadius: 10,
                          background: 'var(--bg-card)', border: '1px solid var(--border)',
                          fontSize: 13, color: 'var(--text-primary)', fontStyle: 'italic',
                        }}>
                          💡 {fundamentals.ai.verdict}
                        </div>
                      )}
                      {/* Winner chips */}
                      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                        {Object.entries({ stronger_growth: fundamentals.ai.stronger_growth, better_value: fundamentals.ai.better_value, lower_risk: fundamentals.ai.lower_risk }).map(([key, sym]) => sym && (
                          <div key={key} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', borderRadius: 20,
                            background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12,
                          }}>
                            <span>{RISK_ICON[key]}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{RISK_LABEL[key]}:</span>
                            <span style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{sym}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metrics table */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, width: '30%' }}>Metric</th>
                          {fundamentals.stocks.map((s, i) => (
                            <th key={s.symbol} style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, color: COLORS[i], fontWeight: 700 }}>
                              {s.symbol}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {METRICS.map(metric => {
                          // Find winner for this metric
                          const candidates = fundamentals.stocks
                            .map(s => ({ sym: s.symbol, val: s[metric.key] }))
                            .filter(c => c.val != null && c.val !== undefined)
                          let winner = null
                          if (candidates.length >= 2) {
                            candidates.sort((a, b) => metric.lower ? a.val - b.val : b.val - a.val)
                            winner = candidates[0].sym
                          }

                          return (
                            <tr key={metric.key} style={{ borderBottom: '1px solid var(--border)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{metric.label}</td>
                              {fundamentals.stocks.map(s => {
                                const val = s[metric.key]
                                const isWinner = winner === s.symbol
                                let display
                                if (val == null || val === undefined) {
                                  display = <span style={{ color: 'var(--text-muted)' }}>—</span>
                                } else if (metric.type === 'pct') {
                                  display = `${(val * 100).toFixed(1)}%`
                                } else if (metric.type === 'price') {
                                  display = `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                } else if (metric.type === 'cap') {
                                  display = val >= 1e12 ? `$${(val / 1e12).toFixed(2)}T` : val >= 1e9 ? `$${(val / 1e9).toFixed(1)}B` : `$${(val / 1e6).toFixed(0)}M`
                                } else {
                                  display = typeof val === 'number' ? val.toFixed(2) : String(val)
                                }
                                if (metric.key === 'change_pct') display = `${val > 0 ? '+' : ''}${val}%`

                                return (
                                  <td key={s.symbol} style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13 }}>
                                    <span style={{ color: isWinner ? '#22c55e' : 'var(--text-primary)', fontWeight: isWinner ? 700 : 400 }}>
                                      {display}
                                    </span>
                                    <WinnerBadge isWinner={isWinner} />
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 13 }}>
                  Add 2+ symbols to see fundamental comparison
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
