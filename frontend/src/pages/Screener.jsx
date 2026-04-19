import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { TableSkeleton } from '../components/Skeleton'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

// ── Scoring engine ───────────────────────────────────────────────────────────
// Five components, each 0–20 pts → total 0–100.
// Neutral defaults used when data is missing so absence isn't punished too harshly.

function scoreStock(s) {
  // Momentum: where is price in its 52-week range?
  let momentum = 10
  if (s.week_52_pos != null) {
    if      (s.week_52_pos >= 80) momentum = 20
    else if (s.week_52_pos >= 65) momentum = 16
    else if (s.week_52_pos >= 45) momentum = 11
    else if (s.week_52_pos >= 25) momentum = 6
    else                          momentum = 2
  }

  // Value: forward P/E preferred, fall back to trailing (lower = cheaper)
  let value = 10
  const pe = s.forward_pe || s.pe_ratio
  if (pe != null && pe > 0) {
    if      (pe < 10)  value = 20
    else if (pe < 15)  value = 17
    else if (pe < 20)  value = 13
    else if (pe < 30)  value = 9
    else if (pe < 50)  value = 5
    else               value = 2
  }

  // Growth: YoY revenue growth % (higher = better)
  let growth = 6
  if (s.revenue_growth != null) {
    if      (s.revenue_growth >= 30) growth = 20
    else if (s.revenue_growth >= 20) growth = 16
    else if (s.revenue_growth >= 10) growth = 12
    else if (s.revenue_growth >=  5) growth = 8
    else if (s.revenue_growth >=  0) growth = 4
    else                             growth = 1
  }

  // Yield: dividend yield % — growth stocks with no div get a small baseline
  let yld = 4
  if (s.dividend_yield != null && s.dividend_yield > 0) {
    if      (s.dividend_yield >= 5) yld = 20
    else if (s.dividend_yield >= 3) yld = 16
    else if (s.dividend_yield >= 2) yld = 11
    else if (s.dividend_yield >= 1) yld = 7
    else                            yld = 3
  }

  // Quality: gross margin % — proxy for pricing power and moat
  let quality = 10
  if (s.gross_margin != null) {
    if      (s.gross_margin >= 65) quality = 20
    else if (s.gross_margin >= 45) quality = 16
    else if (s.gross_margin >= 30) quality = 12
    else if (s.gross_margin >= 15) quality = 8
    else if (s.gross_margin >=  5) quality = 4
    else                           quality = 1
  }

  return {
    total: momentum + value + growth + yld + quality,
    breakdown: { momentum, value, growth, yield: yld, quality },
  }
}

// Generates up to 3 human-readable explanation bullets for a stock's score.
function explainScore(s, bd) {
  const lines = []
  const pe = s.forward_pe || s.pe_ratio

  if (s.revenue_growth != null) {
    if (bd.growth >= 16)      lines.push(`Strong revenue growth (+${s.revenue_growth.toFixed(0)}% YoY)`)
    else if (bd.growth >= 8)  lines.push(`Positive revenue growth (+${s.revenue_growth.toFixed(0)}% YoY)`)
    else if (s.revenue_growth < 0) lines.push(`Revenue declining (${s.revenue_growth.toFixed(0)}% YoY)`)
  }
  if (pe != null) {
    if (bd.value >= 17)       lines.push(`Attractive valuation at ${pe.toFixed(1)}× P/E`)
    else if (bd.value <= 5)   lines.push(`Expensive at ${pe.toFixed(1)}× P/E`)
  }
  if (s.dividend_yield && bd.yield >= 11)
    lines.push(`Solid dividend yield of ${s.dividend_yield.toFixed(2)}%`)
  if (s.week_52_pos != null) {
    if (bd.momentum >= 16)    lines.push(`Near 52-week high — price in top ${(100 - s.week_52_pos).toFixed(0)}th percentile`)
    else if (bd.momentum <= 4) lines.push(`Near 52-week low — possible mean-reversion setup`)
  }
  if (s.gross_margin != null && bd.quality >= 16)
    lines.push(`High-margin business (${s.gross_margin.toFixed(0)}% gross margin)`)
  if (s.volume_ratio != null && s.volume_ratio >= 2)
    lines.push(`Volume spike — ${s.volume_ratio.toFixed(1)}× above average`)

  return lines.slice(0, 3)
}

function scoreColor(n) {
  if (n >= 75) return '#22c55e'
  if (n >= 60) return '#14b8a6'
  if (n >= 45) return '#f59e0b'
  if (n >= 30) return '#f97316'
  return '#ef4444'
}
function scoreLabel(n) {
  if (n >= 75) return 'Excellent'
  if (n >= 60) return 'Strong'
  if (n >= 45) return 'Moderate'
  if (n >= 30) return 'Fair'
  return 'Weak'
}

// ── ScoreBadge ───────────────────────────────────────────────────────────────
const BREAKDOWN_LABELS = [
  { key: 'momentum', label: 'Momentum', tip: '52-week price position' },
  { key: 'value',    label: 'Value',    tip: 'P/E vs peers'           },
  { key: 'growth',   label: 'Growth',   tip: 'YoY revenue growth'     },
  { key: 'yield',    label: 'Yield',    tip: 'Dividend yield'         },
  { key: 'quality',  label: 'Quality',  tip: 'Gross margin'           },
]

function ScoreBadge({ score, breakdown, stock }) {
  const [tipPos, setTipPos] = useState(null)
  const ref = useRef()
  const color = scoreColor(score)
  const explanation = explainScore(stock, breakdown)

  function handleEnter() {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setTipPos({ x: r.left + r.width / 2, y: r.top })
  }

  const tooltip = tipPos && createPortal(
    <div style={{
      position: 'fixed',
      left: tipPos.x,
      top: tipPos.y - 10,
      transform: 'translate(-50%, -100%)',
      zIndex: 9999,
      background: '#0e1120',
      border: '1px solid #1a1f35',
      borderRadius: 12,
      padding: '14px 16px',
      minWidth: 240,
      boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      pointerEvents: 'none',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: '#5a6a8e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            FinSight Score
          </div>
          <div style={{ fontSize: 11, color, fontWeight: 700 }}>{scoreLabel(score)}</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
      </div>

      {/* Component breakdown bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: explanation.length ? 12 : 0 }}>
        {BREAKDOWN_LABELS.map(({ key, label }) => {
          const val = breakdown[key]
          const pct = (val / 20) * 100
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#5a6a8e', width: 56, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, height: 4, background: '#1a1f35', borderRadius: 99 }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 99,
                  background: pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444',
                }} />
              </div>
              <span style={{ fontSize: 10, color: '#94a3b8', width: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {val}/20
              </span>
            </div>
          )
        })}
      </div>

      {/* Explanation bullets */}
      {explanation.length > 0 && (
        <div style={{ borderTop: '1px solid #1a1f35', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {explanation.map((line, i) => (
            <div key={i} style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ color, marginTop: 1, flexShrink: 0 }}>›</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Caret */}
      <div style={{
        position: 'absolute', bottom: -5, left: '50%',
        width: 10, height: 10,
        background: '#0e1120', border: '1px solid #1a1f35',
        borderTop: 'none', borderLeft: 'none',
        transform: 'translateX(-50%) rotate(45deg)',
      }} />
    </div>,
    document.body
  )

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setTipPos(null)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: '50%',
          background: color + '1a',
          border: `1.5px solid ${color}50`,
          color, fontWeight: 800, fontSize: 12,
          cursor: 'default', userSelect: 'none',
          transition: 'transform 0.12s, box-shadow 0.12s',
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'scale(1.12)'
          e.currentTarget.style.boxShadow = `0 0 14px ${color}40`
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {score}
      </div>
      {tooltip}
    </>
  )
}

// ── Preset screens ────────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'all',      label: 'All',         emoji: '🌐', filters: {} },
  { id: 'value',    label: 'Value',        emoji: '💎', filters: { maxPE: '20', minCap: '5' } },
  { id: 'growth',   label: 'Growth',       emoji: '🚀', filters: { minRevGrowth: '15' } },
  { id: 'dividend', label: 'High Yield',   emoji: '💰', filters: { minDivYield: '2' } },
  { id: 'momentum', label: 'Momentum',     emoji: '📈', filters: { minWeek52Pos: '75' } },
  { id: 'near_low', label: 'Near 52W Low', emoji: '📉', filters: { maxWeek52Pos: '20' } },
  { id: 'vol',      label: 'Vol Spike',    emoji: '⚡', filters: { minVolRatio: '2' } },
]

// ── Sector colours ────────────────────────────────────────────────────────────
const SECTOR_COLOR = {
  'Technology':             '#6366f1',
  'Healthcare':             '#06b6d4',
  'Financial Services':     '#f59e0b',
  'Consumer Cyclical':      '#f97316',
  'Communication Services': '#8b5cf6',
  'Industrials':            '#64748b',
  'Consumer Defensive':     '#22c55e',
  'Energy':                 '#ef4444',
  'Real Estate':            '#84cc16',
  'Utilities':              '#a78bfa',
  'Basic Materials':        '#78716c',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCap(v) {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v}`
}
function fmtN(v, dec = 1) { return v == null ? '—' : parseFloat(v).toFixed(dec) }

function Week52Bar({ pos }) {
  if (pos == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const pct   = Math.max(0, Math.min(100, pos))
  const color = pct >= 75 ? 'var(--green)' : pct <= 25 ? 'var(--red)' : 'var(--yellow)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 56, height: 4, background: 'var(--border)', borderRadius: 99, flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 28 }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function SectorBadge({ sector }) {
  if (!sector) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const color = SECTOR_COLOR[sector] || '#94a3b8'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, color, background: color + '18', whiteSpace: 'nowrap',
    }}>
      {sector}
    </span>
  )
}

function SortArrow({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <span style={{ opacity: 0.2, marginLeft: 4 }}>↕</span>
  return <span style={{ marginLeft: 4, color: 'var(--accent-light)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function FilterInput({ label, value, onChange, placeholder, width = 110 }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      <input
        type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
          fontSize: 13, outline: 'none', width,
        }}
      />
    </div>
  )
}

// ── AI Reason badge (shown per row when AI search is active) ─────────────────
function AIReasonBadge({ reason, confidence }) {
  const [pos, setPos] = useState(null)
  const ref = useRef()
  const color = confidence === 'High' ? '#22c55e' : confidence === 'Low' ? '#f97316' : '#f59e0b'

  const tooltip = pos && createPortal(
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y - 10,
      transform: 'translate(-50%, -100%)', zIndex: 9999,
      background: '#0e1120', border: '1px solid #1a1f35',
      borderRadius: 10, padding: '10px 14px', maxWidth: 260,
      fontSize: 12, color: '#94a3b8', lineHeight: 1.5,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)', pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        AI Match · {confidence} confidence
      </div>
      {reason}
      <div style={{
        position: 'absolute', bottom: -5, left: '50%',
        width: 10, height: 10, background: '#0e1120',
        border: '1px solid #1a1f35', borderTop: 'none', borderLeft: 'none',
        transform: 'translateX(-50%) rotate(45deg)',
      }} />
    </div>,
    document.body
  )

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: r.left + r.width / 2, y: r.top }) }}
        onMouseLeave={() => setPos(null)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
          background: color + '1a', color, cursor: 'default',
          border: `1px solid ${color}40`,
        }}
      >
        AI ✦
      </span>
      {tooltip}
    </>
  )
}

// ── Default filter state ──────────────────────────────────────────────────────
const EMPTY_FILTERS = {
  search: '', sector: 'All',
  minCap: '', maxPE: '',
  minDivYield: '', minRevGrowth: '',
  minWeek52Pos: '', maxWeek52Pos: '',
  minVolRatio: '',
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLUMNS = [
  { key: '_score',         label: 'Score',      align: 'center' },
  { key: 'symbol',         label: 'Symbol'                      },
  { key: 'name',           label: 'Name'                        },
  { key: 'price',          label: 'Price',      align: 'right'  },
  { key: 'change_pct',     label: 'Change',     align: 'right'  },
  { key: 'market_cap',     label: 'Mkt Cap',    align: 'right'  },
  { key: 'pe_ratio',       label: 'P/E',        align: 'right'  },
  { key: 'forward_pe',     label: 'Fwd P/E',    align: 'right'  },
  { key: 'dividend_yield', label: 'Div Yield',  align: 'right'  },
  { key: 'revenue_growth', label: 'Rev Growth', align: 'right'  },
  { key: 'beta',           label: 'Beta',       align: 'right'  },
  { key: 'week_52_pos',    label: '52W Range'                   },
  { key: 'sector',         label: 'Sector'                      },
  { key: '_actions',       label: '',           sortable: false  },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function Screener({ onSelectStock, onOpenDCF }) {
  const [stocks,       setStocks]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState(null)
  const [sortBy,       setSortBy]       = useState('_score')
  const [sortDir,      setSortDir]      = useState('desc')
  const [filters,      setFilters]      = useState(EMPTY_FILTERS)
  const [activePreset, setActivePreset] = useState('all')
  const [showAdv,      setShowAdv]      = useState(false)

  // AI search state
  const [aiQuery,   setAiQuery]   = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState(null)
  const [aiResults, setAiResults] = useState(null)  // { interpretation, matches, suggested_filters }

  async function handleAISearch() {
    const q = aiQuery.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    setAiError(null)
    setAiResults(null)
    try {
      const { data } = await axios.post(`${API}/screener/ai-search`, { query: q })
      setAiResults(data)
      setActivePreset('custom')
    } catch (e) {
      setAiError(e.response?.data?.detail || 'AI search failed — make sure screener data is loaded first.')
    } finally {
      setAiLoading(false)
    }
  }

  function clearAISearch() {
    setAiResults(null)
    setAiError(null)
    setAiQuery('')
  }

  function applyAISuggestedFilters() {
    const sf = aiResults?.suggested_filters
    if (!sf) return
    // Exit AI mode first, then apply filters to the full dataset
    setAiResults(null)
    setFilters({
      ...EMPTY_FILTERS,
      sector:       sf.sector       ?? 'All',
      minRevGrowth: sf.minRevGrowth != null ? String(sf.minRevGrowth) : '',
      maxPE:        sf.maxPE        != null ? String(sf.maxPE)        : '',
      minDivYield:  sf.minDivYield  != null ? String(sf.minDivYield)  : '',
      minWeek52Pos: sf.minWeek52Pos != null ? String(sf.minWeek52Pos) : '',
      maxWeek52Pos: sf.maxWeek52Pos != null ? String(sf.maxWeek52Pos) : '',
      minCap:       sf.minCap       != null ? String(sf.minCap)       : '',
    })
    setActivePreset('custom')
  }

  // Map symbol → AI reason for use in table rows
  const aiReasonMap = useMemo(() => {
    if (!aiResults?.matches) return {}
    return Object.fromEntries(aiResults.matches.map(m => [m.symbol, { reason: m.reason, confidence: m.confidence }]))
  }, [aiResults])

  useEffect(() => {
    axios.get(`${API}/screener`)
      .then(r => {
        // Enrich each stock with its score + breakdown once on load
        const enriched = r.data.map(s => {
          const { total, breakdown } = scoreStock(s)
          return { ...s, _score: total, _breakdown: breakdown }
        })
        setStocks(enriched)
        setLoading(false)
      })
      .catch(() => { setFetchError('Could not load screener data.'); setLoading(false) })
  }, [])

  const sectors = useMemo(() => {
    const s = new Set(stocks.map(x => x.sector).filter(Boolean))
    return ['All', ...Array.from(s).sort()]
  }, [stocks])

  function setFilter(key) {
    return val => { setFilters(f => ({ ...f, [key]: val })); setActivePreset('custom') }
  }

  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'symbol' || col === 'name' ? 'asc' : 'desc') }
  }

  function applyPreset(p) {
    setActivePreset(p.id)
    setFilters({ ...EMPTY_FILTERS, ...p.filters })
  }

  function resetAll() {
    setFilters(EMPTY_FILTERS)
    setActivePreset('all')
    setShowAdv(false)
  }

  const activeFilterCount = [
    filters.search, filters.sector !== 'All' ? 'x' : '',
    filters.minCap, filters.maxPE, filters.minDivYield,
    filters.minRevGrowth, filters.minWeek52Pos, filters.maxWeek52Pos,
    filters.minVolRatio,
  ].filter(Boolean).length

  const filtered = useMemo(() => {
    let data = [...stocks]

    // AI search takes priority — show only matched symbols, skip all other filters
    if (aiResults?.matches?.length) {
      const matchSet = new Set(aiResults.matches.map(m => m.symbol))
      data = data.filter(s => matchSet.has(s.symbol))
      data.sort((a, b) => {
        const av = a[sortBy] ?? (typeof b[sortBy] === 'number' ? -Infinity : '')
        const bv = b[sortBy] ?? (typeof a[sortBy] === 'number' ? -Infinity : '')
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
      return data
    }

    const q = filters.search.trim().toLowerCase()
    if (q)                  data = data.filter(s => s.symbol.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q)))
    if (filters.sector !== 'All') data = data.filter(s => s.sector === filters.sector)
    if (filters.minCap)     data = data.filter(s => s.market_cap    != null && s.market_cap    >= parseFloat(filters.minCap) * 1e9)
    if (filters.maxPE)      data = data.filter(s => s.pe_ratio      != null && s.pe_ratio      <= parseFloat(filters.maxPE))
    if (filters.minDivYield)  data = data.filter(s => s.dividend_yield != null && s.dividend_yield >= parseFloat(filters.minDivYield))
    if (filters.minRevGrowth) data = data.filter(s => s.revenue_growth != null && s.revenue_growth >= parseFloat(filters.minRevGrowth))
    if (filters.minWeek52Pos) data = data.filter(s => s.week_52_pos   != null && s.week_52_pos   >= parseFloat(filters.minWeek52Pos))
    if (filters.maxWeek52Pos) data = data.filter(s => s.week_52_pos   != null && s.week_52_pos   <= parseFloat(filters.maxWeek52Pos))
    if (filters.minVolRatio)  data = data.filter(s => s.volume_ratio  != null && s.volume_ratio  >= parseFloat(filters.minVolRatio))

    data.sort((a, b) => {
      const av = a[sortBy] ?? (typeof b[sortBy] === 'number' ? -Infinity : '')
      const bv = b[sortBy] ?? (typeof a[sortBy] === 'number' ? -Infinity : '')
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return data
  }, [stocks, filters, sortBy, sortDir])

  // Score distribution for the legend
  const scoreStats = useMemo(() => {
    if (!filtered.length) return null
    const scores = filtered.map(s => s._score).filter(Boolean)
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    const top = scores.filter(s => s >= 60).length
    return { avg, top, total: scores.length }
  }, [filtered])

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>Stock Screener</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : `${filtered.length} of ${stocks.length} stocks`}
            {scoreStats && !loading && (
              <span style={{ marginLeft: 12 }}>
                · Avg score <strong style={{ color: scoreColor(scoreStats.avg) }}>{scoreStats.avg}</strong>
                · {scoreStats.top} scored 60+
              </span>
            )}
          </p>
        </div>
      </div>

      {/* AI Natural-Language Search */}
      <div className="card" style={{ padding: '16px 20px', background: 'linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(139,92,246,0.07) 100%)', borderColor: 'rgba(99,102,241,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-light)' }}>Ask AI</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Describe what you're looking for in plain English</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={aiQuery}
            onChange={e => setAiQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAISearch()}
            placeholder='e.g. "Profitable tech companies with strong growth but not overvalued" or "High dividend energy stocks near 52-week low"'
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(99,102,241,0.3)',
              background: 'rgba(14,17,32,0.8)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none',
            }}
          />
          <button
            onClick={handleAISearch}
            disabled={aiLoading || !aiQuery.trim()}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: aiLoading ? 'var(--border)' : 'var(--accent)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: aiLoading || !aiQuery.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', opacity: !aiQuery.trim() ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
          >
            {aiLoading ? '…' : 'Search'}
          </button>
          {(aiResults || aiError) && (
            <button onClick={clearAISearch} style={{
              padding: '10px 14px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'none',
              color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
            }}>
              Clear
            </button>
          )}
        </div>

        {/* AI error */}
        {aiError && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#fca5a5', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
            {aiError}
          </div>
        )}

        {/* AI results interpretation banner */}
        {aiResults && (
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: 'var(--accent-light)', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AI found {aiResults.matches?.length ?? 0} matches
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {aiResults.interpretation}
              </div>
            </div>
            {aiResults.suggested_filters && Object.values(aiResults.suggested_filters).some(v => v != null) && (
              <button onClick={applyAISuggestedFilters} style={{
                padding: '7px 14px', borderRadius: 8, whiteSpace: 'nowrap',
                border: '1px solid rgba(99,102,241,0.4)',
                background: 'rgba(99,102,241,0.1)', color: 'var(--accent-light)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                Apply suggested filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter card */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Row 1: Search + Sector + Filters toggle + Reset */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Search</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
              <input
                type="text" value={filters.search} onChange={e => setFilter('search')(e.target.value)}
                placeholder="Symbol or company name…"
                style={{
                  width: '100%', padding: '8px 11px 8px 30px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  fontSize: 13, outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sector</label>
            <select
              value={filters.sector} onChange={e => setFilter('sector')(e.target.value)}
              style={{
                padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none', cursor: 'pointer', minWidth: 170,
              }}
            >
              {sectors.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              onClick={() => setShowAdv(v => !v)}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: `1px solid ${showAdv ? 'var(--accent)' : 'var(--border)'}`,
                background: showAdv ? 'var(--accent-dim)' : 'none',
                color: showAdv ? 'var(--accent-light)' : 'var(--text-secondary)',
                fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Filters {activeFilterCount > 0 && (
                <span style={{ marginLeft: 5, background: 'var(--accent)', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={resetAll}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Preset pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map(p => {
            const on = activePreset === p.id
            return (
              <button key={p.id} onClick={() => applyPreset(p)} style={{
                padding: '6px 14px', borderRadius: 99,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                background: on ? 'var(--accent-dim)' : 'none',
                color: on ? 'var(--accent-light)' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {p.emoji} {p.label}
              </button>
            )
          })}
        </div>

        {/* Row 3: Advanced filters */}
        {showAdv && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <FilterInput label="Min Cap ($B)"      value={filters.minCap}        onChange={setFilter('minCap')}        placeholder="e.g. 10" />
            <FilterInput label="Max P/E"           value={filters.maxPE}         onChange={setFilter('maxPE')}         placeholder="e.g. 30" />
            <FilterInput label="Min Div Yield (%)" value={filters.minDivYield}   onChange={setFilter('minDivYield')}   placeholder="e.g. 2"  />
            <FilterInput label="Min Rev Growth (%)" value={filters.minRevGrowth} onChange={setFilter('minRevGrowth')} placeholder="e.g. 10" />
            <FilterInput label="Min 52W Pos (%)"   value={filters.minWeek52Pos}  onChange={setFilter('minWeek52Pos')}  placeholder="0–100"   />
            <FilterInput label="Max 52W Pos (%)"   value={filters.maxWeek52Pos}  onChange={setFilter('maxWeek52Pos')}  placeholder="0–100"   />
            <FilterInput label="Min Vol Ratio"     value={filters.minVolRatio}   onChange={setFilter('minVolRatio')}   placeholder="e.g. 2"  />
          </div>
        )}
      </div>

      {/* Score legend */}
      {!loading && stocks.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Score:</span>
          {[
            { range: '75–100', label: 'Excellent', color: '#22c55e' },
            { range: '60–74',  label: 'Strong',    color: '#14b8a6' },
            { range: '45–59',  label: 'Moderate',  color: '#f59e0b' },
            { range: '30–44',  label: 'Fair',      color: '#f97316' },
            { range: '0–29',   label: 'Weak',      color: '#ef4444' },
          ].map(({ range, label, color }) => (
            <span key={range} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              {label} <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>({range})</span>
            </span>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4, opacity: 0.7 }}>· Hover score for breakdown</span>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20 }}><TableSkeleton rows={12} /></div>
        ) : fetchError ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#fca5a5', fontSize: 14 }}>{fetchError}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>No stocks match your filters</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Try widening the criteria or click Reset</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 1060 }}>
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                      style={{
                        cursor: col.sortable !== false ? 'pointer' : 'default',
                        userSelect: 'none',
                        textAlign: col.align || 'left',
                        padding: '10px 14px',
                        whiteSpace: 'nowrap',
                        background: sortBy === col.key ? 'rgba(99,102,241,0.06)' : undefined,
                      }}
                    >
                      {col.label}
                      {col.sortable !== false && <SortArrow col={col.key} sortBy={sortBy} sortDir={sortDir} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const isPos  = s.change_pct >= 0
                  const volHot = s.volume_ratio != null && s.volume_ratio >= 2.0
                  const rank   = sortBy === '_score' ? i + 1 : null
                  return (
                    <tr key={s.symbol} onClick={() => onSelectStock(s.symbol)}>

                      {/* Score */}
                      <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                        <ScoreBadge score={s._score} breakdown={s._breakdown} stock={s} />
                      </td>

                      {/* Symbol */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {rank && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 18, fontVariantNumeric: 'tabular-nums' }}>
                              #{rank}
                            </span>
                          )}
                          <span style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: 13 }}>{s.symbol}</span>
                          {volHot && (
                            <span title={`Volume ${s.volume_ratio.toFixed(1)}× avg`} style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                            }}>
                              {s.volume_ratio.toFixed(1)}×
                            </span>
                          )}
                          {aiReasonMap[s.symbol] && (
                            <AIReasonBadge reason={aiReasonMap[s.symbol].reason} confidence={aiReasonMap[s.symbol].confidence} />
                          )}
                        </div>
                      </td>

                      {/* Name */}
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', padding: '10px 14px' }}>
                        {s.name}
                      </td>

                      {/* Price */}
                      <td style={{ textAlign: 'right', fontWeight: 600, padding: '10px 14px' }}>
                        {s.price != null ? `$${s.price.toFixed(2)}` : '—'}
                      </td>

                      {/* Change */}
                      <td style={{ textAlign: 'right', padding: '10px 14px' }}>
                        {s.change_pct != null ? (
                          <span style={{
                            background: isPos ? 'var(--green-dim)' : 'var(--red-dim)',
                            color: isPos ? 'var(--green)' : 'var(--red)',
                            padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                          }}>
                            {isPos ? '+' : ''}{s.change_pct.toFixed(2)}%
                          </span>
                        ) : '—'}
                      </td>

                      {/* Market Cap */}
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', padding: '10px 14px' }}>
                        {fmtCap(s.market_cap)}
                      </td>

                      {/* P/E */}
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', padding: '10px 14px' }}>
                        {fmtN(s.pe_ratio)}
                      </td>

                      {/* Fwd P/E */}
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', padding: '10px 14px' }}>
                        {fmtN(s.forward_pe)}
                      </td>

                      {/* Dividend Yield */}
                      <td style={{ textAlign: 'right', padding: '10px 14px',
                        color: s.dividend_yield ? 'var(--green)' : 'var(--text-muted)',
                        fontWeight: s.dividend_yield ? 500 : 400,
                      }}>
                        {s.dividend_yield ? `${s.dividend_yield.toFixed(2)}%` : '—'}
                      </td>

                      {/* Revenue Growth */}
                      <td style={{ textAlign: 'right', padding: '10px 14px',
                        color: s.revenue_growth == null ? 'var(--text-muted)'
                          : s.revenue_growth >= 0 ? 'var(--green)' : 'var(--red)',
                        fontWeight: s.revenue_growth != null ? 500 : 400,
                      }}>
                        {s.revenue_growth != null ? `${s.revenue_growth > 0 ? '+' : ''}${s.revenue_growth.toFixed(1)}%` : '—'}
                      </td>

                      {/* Beta */}
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', padding: '10px 14px' }}>
                        {fmtN(s.beta, 2)}
                      </td>

                      {/* 52W Range */}
                      <td style={{ padding: '10px 14px' }}>
                        <Week52Bar pos={s.week_52_pos} />
                      </td>

                      {/* Sector */}
                      <td style={{ padding: '10px 14px' }}>
                        <SectorBadge sector={s.sector} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 10px 10px 0', whiteSpace: 'nowrap' }}>
                        {onOpenDCF && (
                          <button
                            onClick={e => { e.stopPropagation(); onOpenDCF(s.symbol) }}
                            title={`Open DCF valuation for ${s.symbol}`}
                            style={{
                              padding: '4px 9px', borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'none', color: 'var(--text-muted)',
                              fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              transition: 'all 0.12s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-light)' }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                          >
                            DCF
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && !fetchError && filtered.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
          Showing {filtered.length} of {stocks.length} stocks · Click any row to analyze · Scores update on page load
        </p>
      )}
    </div>
  )
}
