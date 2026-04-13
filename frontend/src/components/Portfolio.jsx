import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'
const STORAGE_KEY = 'finsight_portfolio'

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#a855f7','#f97316','#84cc16','#ec4899','#14b8a6']
const RISK_COLOR = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }

const DEMO = [
  { symbol: 'AAPL', shares: 50,  buyPrice: 178 },
  { symbol: 'MSFT', shares: 30,  buyPrice: 375 },
  { symbol: 'NVDA', shares: 15,  buyPrice: 495 },
  { symbol: 'GOOGL', shares: 40, buyPrice: 162 },
  { symbol: 'META', shares: 20,  buyPrice: 480 },
  { symbol: 'JPM',  shares: 45,  buyPrice: 192 },
  { symbol: 'JNJ',  shares: 35,  buyPrice: 155 },
  { symbol: 'AMZN', shares: 20,  buyPrice: 182 },
]

// ── Local storage hook ────────────────────────────────────────────────────────
function usePortfolio() {
  const [holdings, setHoldings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
  })
  const save = items => { setHoldings(items); localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) }
  const add    = h  => save([...holdings, { ...h, id: Date.now() + Math.random() }])
  const remove = id => save(holdings.filter(h => h.id !== id))
  const loadDemo = () => save(DEMO.map((h, i) => ({ ...h, id: Date.now() + i })))
  const clearAll = () => save([])
  return { holdings, add, remove, loadDemo, clearAll }
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtUSD  = v => v == null ? '—' : `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct  = (v, plus = true) => v == null ? '—' : `${plus && v > 0 ? '+' : ''}${v.toFixed(2)}%`
const fmtSign = v => v == null ? '—' : `${v >= 0 ? '+' : '-'}${fmtUSD(v)}`

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, small }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '16px 18px', flex: 1, minWidth: 130,
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: small ? 16 : 20, fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function ScoreRing({ score }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  const label = score >= 70 ? 'Well Diversified' : score >= 40 ? 'Moderately Diversified' : 'Concentrated'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 58, height: 58, borderRadius: '50%', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 900, color,
        }}>{score}</div>
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

function ConcentrationBar({ label, pct, color = 'var(--accent)', warn }) {
  const c = warn && pct > warn ? '#ef4444' : color
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{pct?.toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function AllocationPie({ data, title, colors }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 20px 12px' }}>
      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2} dataKey="value">
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip
            formatter={(val) => [`$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${(val/total*100).toFixed(1)}%)`, '']}
            contentStyle={{ background: '#1e2235', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
        {data.slice(0, 5).map((d, i) => (
          <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i % colors.length], display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.name}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{(d.value / total * 100).toFixed(1)}%</span>
          </div>
        ))}
        {data.length > 5 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>+{data.length - 5} more</span>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Portfolio({ onSelectStock }) {
  const { holdings, add, remove, loadDemo, clearAll } = usePortfolio()
  const [prices,    setPrices]    = useState({})
  const [stockMeta, setStockMeta] = useState({})
  const [loadingPrices, setLoadingPrices] = useState(false)

  const [form,     setForm]     = useState({ symbol: '', shares: '', buyPrice: '' })
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState(null)

  const [analysis,   setAnalysis]   = useState(null)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [analyzeErr, setAnalyzeErr] = useState(null)

  const [activeTab, setActiveTab] = useState('overview') // overview | holdings | analysis

  // ── Fetch prices for all holdings ─────────────────────────────────────────
  useEffect(() => {
    const missing = holdings.filter(h => !prices[h.symbol])
    if (missing.length === 0) return
    setLoadingPrices(true)
    Promise.allSettled(
      missing.map(h =>
        axios.get(`${API}/stock/${h.symbol}`).then(r => ({ symbol: h.symbol, data: r.data }))
      )
    ).then(results => {
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          const { symbol, data } = r.value
          setPrices(p => ({ ...p, [symbol]: data.price }))
          setStockMeta(m => ({
            ...m,
            [symbol]: {
              name: data.name, sector: data.sector || '',
              change_pct: data.change_pct || 0, beta: data.beta || 1.0,
            }
          }))
        }
      })
      setLoadingPrices(false)
    })
  }, [holdings])

  // ── Derived metrics ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (holdings.length === 0) return null
    const enriched = holdings.map(h => {
      const cur  = prices[h.symbol] || h.buyPrice
      const val  = cur * h.shares
      const cost = h.buyPrice * h.shares
      const pnl  = val - cost
      const chg  = stockMeta[h.symbol]?.change_pct || 0
      return { ...h, cur, val, cost, pnl, pnlPct: cost > 0 ? pnl/cost*100 : 0, dailyChg: val * chg/100, chgPct: chg }
    })
    const totalVal  = enriched.reduce((s, h) => s + h.val, 0)
    const totalCost = enriched.reduce((s, h) => s + h.cost, 0)
    const totalPnL  = totalVal - totalCost
    const returnPct = totalCost > 0 ? totalPnL / totalCost * 100 : 0
    const dailyPnL  = enriched.reduce((s, h) => s + h.dailyChg, 0)
    const dailyPct  = totalVal > 0 ? dailyPnL / totalVal * 100 : 0

    const withWeight = enriched.map(h => ({ ...h, weight: totalVal > 0 ? h.val/totalVal*100 : 0 }))
      .sort((a, b) => b.val - a.val)

    const sorted     = [...withWeight].sort((a, b) => b.pnlPct - a.pnlPct)
    const best       = sorted[0]
    const worst      = sorted[sorted.length - 1]
    const largest    = withWeight[0]

    const sectorMap = {}
    withWeight.forEach(h => {
      const sec = stockMeta[h.symbol]?.sector || 'Unknown'
      sectorMap[sec] = (sectorMap[sec] || 0) + h.val
    })

    const top1Pct = withWeight[0]?.weight || 0
    const top3Pct = withWeight.slice(0, 3).reduce((s, h) => s + h.weight, 0)

    const sectorEntries = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])
    const topSectorPct  = totalVal > 0 ? (sectorEntries[0]?.[1] || 0) / totalVal * 100 : 0

    return { enriched: withWeight, totalVal, totalCost, totalPnL, returnPct, dailyPnL, dailyPct, best, worst, largest, sectorMap, top1Pct, top3Pct, topSectorPct }
  }, [holdings, prices, stockMeta])

  // Chart data
  const holdingsChartData = metrics ? metrics.enriched.map(h => ({ name: h.symbol, value: h.val })) : []
  const sectorChartData   = metrics ? Object.entries(metrics.sectorMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value) : []

  // Scenario testing (client-side)
  const scenarios = useMemo(() => {
    if (!metrics || metrics.enriched.length === 0) return []
    const { totalVal, enriched } = metrics
    const largest = enriched[0]
    const techVal = enriched.filter(h => (stockMeta[h.symbol]?.sector || '') === 'Technology').reduce((s,h) => s+h.val, 0)

    return [
      {
        label: `${largest?.symbol} drops 10%`,
        desc: `Your largest holding falls 10%`,
        impact: largest ? -(largest.val * 0.10) : 0,
        impactPct: largest ? -(largest.val * 0.10 / totalVal * 100) : 0,
      },
      {
        label: 'Tech sector drops 10%',
        desc: 'All technology holdings fall 10%',
        impact: -(techVal * 0.10),
        impactPct: -(techVal * 0.10 / totalVal * 100),
      },
      {
        label: 'Market drops 5%',
        desc: 'Broad market selloff of 5%',
        impact: -(totalVal * 0.05),
        impactPct: -5,
      },
      {
        label: 'Market rallies 10%',
        desc: 'Broad market bull run of 10%',
        impact: totalVal * 0.10,
        impactPct: 10,
      },
    ]
  }, [metrics, stockMeta])

  // ── AI Analysis ────────────────────────────────────────────────────────────
  async function runAnalysis() {
    if (!metrics) return
    setAnalyzing(true)
    setAnalyzeErr(null)
    try {
      const payload = metrics.enriched.map(h => ({
        symbol: h.symbol,
        name: stockMeta[h.symbol]?.name || h.symbol,
        shares: h.shares,
        buyPrice: h.buyPrice,
        currentPrice: h.cur,
        sector: stockMeta[h.symbol]?.sector || '',
        change_pct: stockMeta[h.symbol]?.change_pct || 0,
        beta: stockMeta[h.symbol]?.beta || 1.0,
      }))
      const res = await axios.post(`${API}/portfolio/analyze`, { holdings: payload })
      setAnalysis(res.data)
      setActiveTab('analysis')
    } catch (e) {
      setAnalyzeErr(e.response?.data?.detail || 'Analysis failed. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Add holding ────────────────────────────────────────────────────────────
  function handleAdd(e) {
    e.preventDefault()
    setAddError(null)
    const sym      = form.symbol.trim().toUpperCase()
    const shares   = parseFloat(form.shares)
    const buyPrice = parseFloat(form.buyPrice)
    if (!sym) return setAddError('Please enter a ticker symbol.')
    if (!/^[A-Z.-]{1,6}$/.test(sym)) return setAddError(`"${sym}" doesn't look like a valid ticker.`)
    if (holdings.some(h => h.symbol === sym)) return setAddError(`${sym} is already in your portfolio.`)
    if (isNaN(shares) || shares <= 0) return setAddError('Shares must be a positive number.')
    if (isNaN(buyPrice) || buyPrice <= 0) return setAddError('Buy price must be a positive number.')
    add({ symbol: sym, shares, buyPrice })
    setForm({ symbol: '', shares: '', buyPrice: '' })
    setAdding(false)
  }

  // ── Empty State ────────────────────────────────────────────────────────────
  if (holdings.length === 0) {
    return (
      <div style={{ maxWidth: 720, margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>💼</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>Portfolio Analytics</h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
          Track your holdings, analyze performance, understand your risk exposure, and get AI-powered insights — all in one place.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>
          Add your stocks manually or load a demo portfolio to explore the features.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
          <button onClick={() => setAdding(true)} style={{
            padding: '14px 28px', borderRadius: 12, border: 'none',
            background: 'var(--accent)', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>+ Add Your First Stock</button>
          <button onClick={loadDemo} style={{
            padding: '14px 28px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Load Demo Portfolio</button>
        </div>
        {/* Feature preview cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'left' }}>
          {[
            { icon: '📊', title: 'Allocation Charts', desc: 'Visual breakdown by holding and sector' },
            { icon: '✨', title: 'AI Insights', desc: 'Professional analysis of your concentration and risk' },
            { icon: '⚡', title: 'Scenario Testing', desc: 'See how your portfolio reacts to market moves' },
          ].map(f => (
            <div key={f.title} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
              <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{f.title}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
        {adding && (
          <AddForm form={form} setForm={setForm} error={addError} onSubmit={handleAdd} onCancel={() => { setAdding(false); setAddError(null) }} />
        )}
      </div>
    )
  }

  const isPos = v => v != null && v >= 0

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }} className="fade-in">

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>💼 Portfolio</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={runAnalysis} disabled={analyzing} style={{
            padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: analyzing ? 'not-allowed' : 'pointer',
            background: analyzing ? 'var(--bg-card-hover)' : 'linear-gradient(135deg,#6366f1,#818cf8)',
            color: analyzing ? 'var(--text-muted)' : 'white',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {analyzing ? '⏳ Analyzing…' : '✨ AI Analysis'}
          </button>
          <button onClick={() => { setAdding(!adding); setAddError(null) }} style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>+ Add Stock</button>
          <button onClick={clearAll} style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
          }} title="Clear all holdings">✕ Clear</button>
        </div>
      </div>

      {/* Error */}
      {analyzeErr && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5', display: 'flex', gap: 8, alignItems: 'center' }}>
          ⚠️ {analyzeErr}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <AddForm form={form} setForm={setForm} error={addError} onSubmit={handleAdd} onCancel={() => { setAdding(false); setAddError(null) }} />
      )}

      {/* ── STATS ROW ── */}
      {metrics && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatCard label="Total Value" value={fmtUSD(metrics.totalVal)} />
          <StatCard
            label="Today's P&L"
            value={fmtSign(metrics.dailyPnL)}
            sub={fmtPct(metrics.dailyPct)}
            color={isPos(metrics.dailyPnL) ? 'var(--green)' : 'var(--red)'}
          />
          <StatCard
            label="Total Return"
            value={fmtSign(metrics.totalPnL)}
            sub={fmtPct(metrics.returnPct)}
            color={isPos(metrics.totalPnL) ? 'var(--green)' : 'var(--red)'}
          />
          <StatCard
            label="Best Performer"
            value={metrics.best?.symbol}
            sub={fmtPct(metrics.best?.pnlPct)}
            color="var(--green)"
            small
          />
          <StatCard
            label="Worst Performer"
            value={metrics.worst?.symbol}
            sub={fmtPct(metrics.worst?.pnlPct)}
            color="var(--red)"
            small
          />
          <StatCard
            label="Largest Holding"
            value={metrics.largest?.symbol}
            sub={`${metrics.top1Pct.toFixed(1)}% of portfolio`}
            small
          />
          {loadingPrices && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              ⏳ Loading prices…
            </div>
          )}
        </div>
      )}

      {/* ── TABS ── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'overview',  label: '📊 Overview'  },
          { id: 'holdings',  label: '📋 Holdings'  },
          { id: 'analysis',  label: analysis ? '✨ AI Analysis' : '✨ AI Analysis', disabled: !analysis },
        ].map(t => (
          <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} style={{
            padding: '8px 18px', borderRadius: 9, border: 'none',
            background: activeTab === t.id ? 'var(--accent)' : 'transparent',
            color: t.disabled ? 'var(--text-muted)' : activeTab === t.id ? 'white' : 'var(--text-muted)',
            fontWeight: activeTab === t.id ? 700 : 400, fontSize: 13,
            cursor: t.disabled ? 'not-allowed' : 'pointer', opacity: t.disabled ? 0.5 : 1,
          }}>{t.label}{t.id === 'analysis' && !analysis ? ' (run analysis first)' : ''}</button>
        ))}
      </div>

      {/* ══════════ OVERVIEW TAB ══════════ */}
      {activeTab === 'overview' && metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <AllocationPie data={holdingsChartData} title="📦 Holdings Allocation" colors={COLORS} />
            <AllocationPie data={sectorChartData}   title="🏢 Sector Allocation"   colors={COLORS.slice(3)} />
          </div>

          {/* Risk & Concentration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <p style={{ fontWeight: 700, fontSize: 14 }}>🎯 Concentration</p>
                <ScoreRing score={analysis?.diversification_score ?? Math.round(
                  Math.max(0, Math.min(100, 100 - Math.max(0, metrics.top1Pct + metrics.top3Pct/3 - 30) * 0.8
                    + Math.min(Object.keys(metrics.sectorMap).length * 5, 20)
                    + Math.min(holdings.length * 2, 10)))
                )} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ConcentrationBar label={`Largest: ${metrics.largest?.symbol}`}   pct={metrics.top1Pct} warn={30} />
                <ConcentrationBar label="Top 3 holdings"                          pct={metrics.top3Pct} warn={60} color="#f59e0b" />
                <ConcentrationBar label={`Top sector: ${sectorChartData[0]?.name || '—'}`} pct={metrics.topSectorPct} warn={50} color="#06b6d4" />
              </div>
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {metrics.top1Pct > 30 ? `⚠️ ${metrics.largest?.symbol} at ${metrics.top1Pct.toFixed(0)}% is very concentrated. Consider trimming.`
                  : metrics.top3Pct > 60 ? `⚠️ Top 3 holdings make up ${metrics.top3Pct.toFixed(0)}% — consider broadening.`
                  : '✓ Concentration looks healthy across top holdings.'}
              </div>
            </div>

            {/* Scenario testing */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>⚡ Scenario Testing</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {scenarios.map(s => (
                  <div key={s.label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 10,
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{s.label}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.desc}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: s.impact >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {s.impact >= 0 ? '+' : ''}{fmtUSD(s.impact)}
                      </p>
                      <p style={{ fontSize: 11, color: s.impact >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fmtPct(s.impactPct)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ HOLDINGS TAB ══════════ */}
      {activeTab === 'holdings' && metrics && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Symbol', 'Name', 'Shares', 'Avg Cost', 'Price', 'Daily', 'Total P&L', 'Weight', ''].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: h === 'Weight' ? 'right' : 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.enriched.map(h => (
                <tr key={h.id} onClick={() => onSelectStock(h.symbol)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '14px 14px', fontWeight: 700, color: 'var(--accent-light)', fontSize: 14 }}>{h.symbol}</td>
                  <td style={{ padding: '14px 14px', fontSize: 12, color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stockMeta[h.symbol]?.name || '—'}
                  </td>
                  <td style={{ padding: '14px 14px', fontSize: 13 }}>{h.shares.toLocaleString()}</td>
                  <td style={{ padding: '14px 14px', fontSize: 13 }}>{fmtUSD(h.buyPrice)}</td>
                  <td style={{ padding: '14px 14px', fontSize: 13, fontWeight: 600 }}>{prices[h.symbol] ? fmtUSD(prices[h.symbol]) : <span style={{ color: 'var(--text-muted)' }}>…</span>}</td>
                  <td style={{ padding: '14px 14px', fontSize: 13, fontWeight: 600, color: isPos(h.chgPct) ? 'var(--green)' : 'var(--red)' }}>
                    {stockMeta[h.symbol] ? fmtPct(h.chgPct) : '—'}
                  </td>
                  <td style={{ padding: '14px 14px', fontSize: 13 }}>
                    <div style={{ color: isPos(h.pnl) ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {fmtSign(h.pnl)}
                    </div>
                    <div style={{ fontSize: 11, color: isPos(h.pnlPct) ? 'var(--green)' : 'var(--red)' }}>
                      {fmtPct(h.pnlPct)}
                    </div>
                  </td>
                  <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(h.weight, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 38, textAlign: 'right' }}>{h.weight.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 10px' }}>
                    <button onClick={e => { e.stopPropagation(); remove(h.id) }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '4px 6px', borderRadius: 6 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 32 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Cost: <strong style={{ color: 'var(--text-secondary)' }}>{fmtUSD(metrics.totalCost)}</strong></span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Value: <strong style={{ color: 'var(--text-primary)' }}>{fmtUSD(metrics.totalVal)}</strong></span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Return: <strong style={{ color: isPos(metrics.totalPnL) ? 'var(--green)' : 'var(--red)' }}>{fmtSign(metrics.totalPnL)} ({fmtPct(metrics.returnPct)})</strong></span>
          </div>
        </div>
      )}

      {/* ══════════ AI ANALYSIS TAB ══════════ */}
      {activeTab === 'analysis' && analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* AI Summary */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24,
            borderLeft: `3px solid ${RISK_COLOR[analysis.risk_level] || 'var(--accent)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✨</span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>AI Portfolio Analysis</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: `${RISK_COLOR[analysis.risk_level]}22`, color: RISK_COLOR[analysis.risk_level],
                  border: `1px solid ${RISK_COLOR[analysis.risk_level]}44`,
                }}>{analysis.risk_level} Risk</span>
                <button onClick={runAnalysis} disabled={analyzing} style={{
                  padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                }}>↺ Re-run</button>
              </div>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{analysis.summary}</p>
          </div>

          {/* 2-col: insights + charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Insights */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>💡 Key Insights</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(analysis.insights || []).map((insight, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--accent-light)', flexShrink: 0, marginTop: 1, fontSize: 13 }}>→</span>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{insight}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sector chart */}
            <AllocationPie data={sectorChartData} title="🏢 Sector Allocation" colors={COLORS.slice(3)} />
          </div>

          {/* Risk flags + Rebalance suggestions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {analysis.risk_flags?.length > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: 20 }}>
                <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#fca5a5' }}>⚠️ Risk Flags</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analysis.risk_flags.map((flag, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: '#ef4444', marginTop: 3, fontSize: 10 }}>●</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{flag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analysis.rebalance_suggestions?.length > 0 && (
              <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: 20 }}>
                <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--accent-light)' }}>🔄 Rebalance Suggestions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {analysis.rebalance_suggestions.map((s, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent-light)', marginRight: 8 }}>{i + 1}.</span>{s}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Holdings breakdown from analysis */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Holdings Breakdown</p>
              {analysis.diversification_score && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Diversification:</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: analysis.diversification_score >= 70 ? 'var(--green)' : analysis.diversification_score >= 40 ? '#f59e0b' : '#ef4444' }}>
                    {analysis.diversification_score}/100
                  </span>
                </div>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Symbol', 'Weight', 'Value', 'P&L', 'Sector'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.holdings.map((h, i) => (
                  <tr key={h.symbol}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => onSelectStock(h.symbol)}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: 13 }}>{h.symbol}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', maxWidth: 80 }}>
                          <div style={{ width: `${Math.min(h.weight, 100)}%`, height: '100%', borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{h.weight}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>${h.value.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: h.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
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

      {/* Prompt when no analysis yet */}
      {activeTab === 'analysis' && !analysis && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 6 }}>No analysis yet</p>
          <p style={{ fontSize: 13, marginBottom: 20 }}>Click "AI Analysis" to get a professional breakdown of your portfolio</p>
          <button onClick={runAnalysis} style={{
            padding: '12px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>✨ Run AI Analysis</button>
        </div>
      )}

    </div>
  )
}

// ── Add Form ──────────────────────────────────────────────────────────────────
function AddForm({ form, setForm, error, onSubmit, onCancel }) {
  return (
    <form onSubmit={onSubmit} style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 20, marginBottom: 16,
      display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
    }}>
      {error && (
        <div style={{ width: '100%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}
      {[
        { key: 'symbol',   label: 'Ticker',         placeholder: 'AAPL' },
        { key: 'shares',   label: 'Shares',          placeholder: '10' },
        { key: 'buyPrice', label: 'Avg Cost ($)',     placeholder: '150.00' },
      ].map(({ key, label, placeholder }) => (
        <div key={key} style={{ flex: 1, minWidth: 120 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
          <input
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
      ))}
      <button type="submit" style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Add</button>
      <button type="button" onClick={onCancel} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
    </form>
  )
}
