import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'
const STORAGE_KEY = 'finsight_portfolio'
const SECTOR_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#a855f7','#f97316','#84cc16']

function usePortfolio() {
  const [holdings, setHoldings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
  })
  const save = (items) => { setHoldings(items); localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) }
  const add = (holding) => save([...holdings, { ...holding, id: Date.now() }])
  const remove = (id) => save(holdings.filter(h => h.id !== id))
  return { holdings, add, remove }
}

function formatCurrency(val) {
  if (val == null) return 'N/A'
  return val >= 0 ? `+$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`
}

const RISK_COLORS = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }

function ScoreRing({ score }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color,
        }}>{score}</div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Diversification</span>
    </div>
  )
}

export default function Portfolio({ onSelectStock }) {
  const { holdings, add, remove } = usePortfolio()
  const [prices, setPrices] = useState({})
  const [stockMeta, setStockMeta] = useState({})
  const [form, setForm] = useState({ symbol: '', shares: '', buyPrice: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [tab, setTab] = useState('holdings')
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)

  useEffect(() => {
    const symbols = [...new Set(holdings.map(h => h.symbol))]
    symbols.forEach(sym => {
      if (!prices[sym]) {
        axios.get(`${API}/stock/${sym}`)
          .then(res => {
            setPrices(p => ({ ...p, [sym]: res.data.price }))
            setStockMeta(m => ({ ...m, [sym]: { name: res.data.name, sector: res.data.sector || '', change_pct: res.data.change_pct || 0 } }))
          })
          .catch(() => {})
      }
    })
  }, [holdings])

  async function handleAdd(e) {
    e.preventDefault()
    setAddError(null)
    const sym = form.symbol.trim().toUpperCase()
    const shares = parseFloat(form.shares)
    const buyPrice = parseFloat(form.buyPrice)
    if (!sym) return setAddError('Please enter a stock symbol.')
    if (!/^[A-Z]{1,5}$/.test(sym)) return setAddError(`"${sym}" doesn't look like a valid ticker (1–5 letters).`)
    if (holdings.some(h => h.symbol === sym)) return setAddError(`${sym} is already in your portfolio.`)
    if (isNaN(shares) || shares <= 0) return setAddError('Shares must be a positive number.')
    if (isNaN(buyPrice) || buyPrice <= 0) return setAddError('Buy price must be a positive number.')
    add({ symbol: sym, shares, buyPrice })
    setForm({ symbol: '', shares: '', buyPrice: '' })
    setAdding(false)
  }

  async function runAnalysis() {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const enriched = await Promise.all(holdings.map(async h => {
        let meta = stockMeta[h.symbol]
        if (!meta) {
          const res = await axios.get(`${API}/stock/${h.symbol}`)
          meta = { name: res.data.name, sector: res.data.sector || '', change_pct: res.data.change_pct || 0 }
          setPrices(p => ({ ...p, [h.symbol]: res.data.price }))
          setStockMeta(m => ({ ...m, [h.symbol]: meta }))
        }
        return {
          symbol: h.symbol,
          name: meta.name || h.symbol,
          shares: h.shares,
          buyPrice: h.buyPrice,
          currentPrice: prices[h.symbol] || h.buyPrice,
          sector: meta.sector || '',
          change_pct: meta.change_pct || 0,
        }
      }))
      const res = await axios.post(`${API}/portfolio/analyze`, { holdings: enriched })
      setAnalysis(res.data)
      setTab('analysis')
    } catch (e) {
      setAnalyzeError(e.response?.data?.detail || 'Analysis failed. Try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const totalValue = holdings.reduce((sum, h) => sum + ((prices[h.symbol] || h.buyPrice) * h.shares), 0)
  const totalCost = holdings.reduce((sum, h) => sum + h.buyPrice * h.shares, 0)
  const totalPnL = totalValue - totalCost
  const pnlPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0
  const isPnlPositive = totalPnL >= 0

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>💼 Portfolio</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {holdings.length >= 2 && (
            <button onClick={runAnalysis} disabled={analyzing} style={{
              padding: '10px 18px', borderRadius: '10px', border: 'none',
              background: analyzing ? 'var(--bg-card-hover)' : 'linear-gradient(135deg, #6366f1, #818cf8)',
              color: 'white', fontWeight: 600, cursor: analyzing ? 'not-allowed' : 'pointer',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {analyzing ? '⏳ Analyzing…' : '✨ AI Analysis'}
            </button>
          )}
          <button onClick={() => { setAdding(!adding); setAddError(null) }} style={{
            padding: '10px 18px', borderRadius: '10px', border: 'none',
            background: 'var(--accent)', color: 'white', fontWeight: 600, cursor: 'pointer',
          }}>+ Add Stock</button>
        </div>
      </div>

      {/* Summary bar */}
      {holdings.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '16px', padding: '20px 24px', marginBottom: '20px',
          display: 'flex', gap: '40px', flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total Value</p>
            <p style={{ fontSize: 22, fontWeight: 700 }}>${totalValue.toFixed(2)}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total Cost</p>
            <p style={{ fontSize: 22, fontWeight: 700 }}>${totalCost.toFixed(2)}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>P&L</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: isPnlPositive ? 'var(--green)' : 'var(--red)' }}>
              {formatCurrency(totalPnL)} ({pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
            </p>
          </div>
          {analysis && (
            <div style={{ marginLeft: 'auto' }}>
              <ScoreRing score={analysis.diversification_score} />
            </div>
          )}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <form onSubmit={handleAdd} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '16px', padding: '20px', marginBottom: '20px',
          display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          {addError && (
            <div style={{ width: '100%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5' }}>
              {addError}
            </div>
          )}
          {[
            { key: 'symbol', label: 'Symbol', placeholder: 'AAPL' },
            { key: 'shares', label: 'Shares', placeholder: '10' },
            { key: 'buyPrice', label: 'Buy Price ($)', placeholder: '150.00' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
              <input
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
          <button type="submit" style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: 'var(--accent)', color: 'white', fontWeight: 600, cursor: 'pointer',
          }}>Add</button>
          <button type="button" onClick={() => setAdding(false)} style={{
            padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          }}>Cancel</button>
        </form>
      )}

      {holdings.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: 14 }}>
          No holdings yet. Click "Add Stock" to get started!
        </div>
      ) : (
        <>
          {/* Tabs */}
          {analysis && (
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
              {['holdings', 'analysis'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '8px 20px', borderRadius: 9, border: 'none',
                  background: tab === t ? 'var(--accent)' : 'transparent',
                  color: tab === t ? 'white' : 'var(--text-muted)',
                  fontWeight: tab === t ? 600 : 400, cursor: 'pointer', fontSize: 13,
                  textTransform: 'capitalize',
                }}>{t === 'holdings' ? 'Holdings' : '✨ AI Analysis'}</button>
              ))}
            </div>
          )}

          {/* Holdings tab */}
          {tab === 'holdings' && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol', 'Shares', 'Buy Price', 'Current', 'Value', 'P&L', ''].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left',
                        fontSize: 12, color: 'var(--text-muted)', fontWeight: 600,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map(h => {
                    const cur = prices[h.symbol]
                    const value = cur ? cur * h.shares : null
                    const pnl = value ? value - h.buyPrice * h.shares : null
                    const pnlPctH = pnl && h.buyPrice ? (pnl / (h.buyPrice * h.shares)) * 100 : null
                    const isPos = pnl >= 0
                    return (
                      <tr key={h.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => onSelectStock(h.symbol)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--accent-light)', fontSize: 14 }}>{h.symbol}</td>
                        <td style={{ padding: '14px 16px', fontSize: 14 }}>{h.shares}</td>
                        <td style={{ padding: '14px 16px', fontSize: 14 }}>${h.buyPrice.toFixed(2)}</td>
                        <td style={{ padding: '14px 16px', fontSize: 14 }}>{cur ? `$${cur.toFixed(2)}` : '…'}</td>
                        <td style={{ padding: '14px 16px', fontSize: 14 }}>{value ? `$${value.toFixed(2)}` : '…'}</td>
                        <td style={{ padding: '14px 16px', fontSize: 14, color: pnl != null ? (isPos ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)' }}>
                          {pnl != null ? `${formatCurrency(pnl)} (${pnlPctH > 0 ? '+' : ''}${pnlPctH?.toFixed(1)}%)` : '…'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <button onClick={e => { e.stopPropagation(); remove(h.id) }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Analysis tab */}
          {tab === 'analysis' && analysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {analyzeError && (
                <div style={{ background: '#2d1a1a', border: '1px solid #7f1d1d', borderRadius: 12, padding: 16, color: '#fca5a5', fontSize: 13 }}>
                  {analyzeError}
                </div>
              )}

              {/* AI Summary + Risk Level */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24,
                borderLeft: `3px solid ${RISK_COLORS[analysis.risk_level] || 'var(--accent)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>✨</span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>AI Portfolio Summary</span>
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: `${RISK_COLORS[analysis.risk_level]}22`,
                    color: RISK_COLORS[analysis.risk_level],
                    border: `1px solid ${RISK_COLORS[analysis.risk_level]}44`,
                  }}>{analysis.risk_level} Risk</span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{analysis.summary}</p>
              </div>

              {/* Chart + Insights side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Sector Allocation Pie */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Sector Allocation</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={Object.entries(analysis.sector_weights).map(([name, value]) => ({ name, value }))}
                        cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                        paddingAngle={2} dataKey="value"
                      >
                        {Object.keys(analysis.sector_weights).map((_, i) => (
                          <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => `${val.toFixed(1)}%`} contentStyle={{ background: '#1e2235', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Key Insights */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Key Insights</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(analysis.insights || []).map((insight, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '10px 12px', borderRadius: 10,
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                      }}>
                        <span style={{ fontSize: 14, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>→</span>
                        <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Risk Flags */}
              {analysis.risk_flags?.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: 20 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#fca5a5' }}>⚠️ Risk Flags</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {analysis.risk_flags.map((flag, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>●</span>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{flag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rebalance Suggestions */}
              {analysis.rebalance_suggestions?.length > 0 && (
                <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: 20 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--accent-light)' }}>🔄 Rebalance Suggestions</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {analysis.rebalance_suggestions.map((s, i) => (
                      <div key={i} style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
                      }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-light)', marginRight: 8 }}>{i + 1}.</span>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Holdings breakdown from analysis */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>Holdings Breakdown</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Symbol', 'Weight', 'Value', 'P&L', 'Sector'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.holdings.map((h, i) => (
                      <tr key={h.symbol} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: SECTOR_COLORS[i % SECTOR_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: 13 }}>{h.symbol}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', maxWidth: 80 }}>
                              <div style={{ width: `${Math.min(h.weight, 100)}%`, height: '100%', borderRadius: 2, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{h.weight}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }}>${h.value.toLocaleString()}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: h.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {h.pnl >= 0 ? '+' : ''}{h.pnl_pct.toFixed(1)}%
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{h.sector || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
