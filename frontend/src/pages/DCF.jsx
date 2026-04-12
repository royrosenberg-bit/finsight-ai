import { useState, useMemo, useRef, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer,
} from 'recharts'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

// ── Design tokens ──────────────────────────────────────────────────────────
const CONF = {
  High:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)'   },
  Medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  Low:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
}

const TIPS = {
  nearGrowth:    'Expected annual revenue growth for years 1–5. Typically tied to recent momentum and near-term catalysts.',
  longGrowth:    'Expected annual revenue growth for years 6–10. Should be lower than near-term — companies slow down as they scale.',
  ebitMargin:    'Operating income as % of revenue (EBIT Margin). Reflects how efficiently the company converts sales to profit.',
  taxRate:       'Effective corporate tax rate. Applied to operating profit (NOPAT = EBIT × (1 − tax)).',
  capexPct:      'Capital expenditures as % of revenue. Represents investment required to sustain and grow the business.',
  daPct:         'Depreciation & Amortization as % of revenue. Non-cash expense — added back in FCF calculation.',
  wcPct:         'Working capital change as % of revenue change. Higher growth often requires more working capital investment.',
  wacc:          'Weighted Average Cost of Capital — the blended required return on debt + equity. Higher WACC = lower valuation.',
  terminalGrowth:'Long-term steady-state growth after the forecast period. Usually close to GDP growth (1.5–3.5%). Cannot exceed WACC.',
  forecastYears: 'Number of years to explicitly model cash flows. Terminal value captures everything beyond this horizon.',
  marginOfSafety:'(Fair Value − Market Price) / Fair Value. Positive = buying at a discount to intrinsic value.',
  tvPct:         'What fraction of Enterprise Value comes from Terminal Value. >70% signals the model is highly sensitive to long-term assumptions.',
}

const WACC_RANGE = [7, 8, 9, 10, 11, 12, 13]
const TG_RANGE   = [1, 1.5, 2, 2.5, 3, 3.5, 4]

const DEFAULTS = {
  forecastYears: 10,
  nearGrowth: 12,
  longGrowth: 7,
  ebitMargin: 20,
  taxRate: 21,
  capexPct: 5,
  daPct: 3,
  wcPct: 2,
  wacc: 10,
  terminalGrowth: 2.5,
}

// ── Math ───────────────────────────────────────────────────────────────────
function computeDCF(financials, asm) {
  const { revenue, netDebt, sharesOutstanding } = financials
  if (!revenue || !sharesOutstanding) return null

  const d  = asm.wacc / 100
  const tg = asm.terminalGrowth / 100
  if (d <= tg || d <= 0) return null

  let prevRev = revenue
  let pvFCF   = 0
  const projections = []

  for (let i = 0; i < asm.forecastYears; i++) {
    const gr    = (i < 5 ? asm.nearGrowth : asm.longGrowth) / 100
    const rev   = prevRev * (1 + gr)
    const ebit  = rev * (asm.ebitMargin / 100)
    const nopat = ebit  * (1 - asm.taxRate / 100)
    const da    = rev   * (asm.daPct    / 100)
    const capex = rev   * (asm.capexPct / 100)
    const dwc   = (rev - prevRev) * (asm.wcPct / 100)
    const fcf   = nopat + da - capex - dwc
    const pv    = fcf / Math.pow(1 + d, i + 1)
    pvFCF += pv
    projections.push({
      year:    `Y${i + 1}`,
      revenue: +rev.toFixed(2),
      ebit:    +ebit.toFixed(2),
      fcf:     +fcf.toFixed(2),
    })
    prevRev = rev
  }

  const lastFCF = projections[projections.length - 1].fcf
  const tv      = lastFCF * (1 + tg) / (d - tg)
  const pvTV    = tv / Math.pow(1 + d, asm.forecastYears)
  const evB     = pvFCF + pvTV
  const eqB     = evB - (netDebt || 0)
  const price   = (eqB * 1e9) / sharesOutstanding

  return { pvFCF, pvTV, ev: evB, equity: eqB, pricePerShare: price, tvPct: evB > 0 ? pvTV / evB * 100 : 0, projections }
}

// ── Formatters ─────────────────────────────────────────────────────────────
const fmtB = (v, d = 1) => v == null ? '—' : `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(1)+'T' : v.toFixed(d)+'B'}`
const fmtM = v => {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v/1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v/1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v/1e6).toFixed(0)}M`
  return `$${v.toFixed(0)}`
}

// ── Sub-components ─────────────────────────────────────────────────────────
function Tip({ k }) {
  const [show, setShow] = useState(false)
  if (!TIPS[k]) return null
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{
        width: 15, height: 15, borderRadius: '50%', background: 'var(--border)',
        color: 'var(--text-muted)', fontSize: 9, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'help', marginLeft: 5, flexShrink: 0,
      }}>?</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1f35', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 14px', width: 240, fontSize: 11, lineHeight: 1.6,
          color: 'var(--text-secondary)', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          pointerEvents: 'none', whiteSpace: 'normal',
        }}>{TIPS[k]}</div>
      )}
    </span>
  )
}

function Badge({ level }) {
  if (!level) return null
  const c = CONF[level] || CONF.Medium
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>{level}</span>
  )
}

function KV({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '11px 14px',
    }}>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: accent ? 'var(--accent-light)' : 'var(--text-primary)' }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

function AsmInput({ label, tipKey, value, min, max, step, unit, onChange, onReset, explanation, confidence, isEdited, aiValue }) {
  return (
    <div style={{
      background: isEdited ? 'rgba(245,158,11,0.04)' : 'var(--bg-primary)',
      border: `1px solid ${isEdited ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
      borderRadius: 12, padding: '14px 16px',
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
          <Tip k={tipKey} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {confidence && <Badge level={confidence} />}
          {isEdited && aiValue !== undefined && (
            <button
              onClick={onReset}
              title={`Reset to AI value (${aiValue}${unit})`}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 20, border: '1px solid rgba(245,158,11,0.5)',
                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                animation: 'fadeIn 0.15s ease',
              }}
            >
              ↺ <span style={{ fontSize: 10 }}>AI: {aiValue}{unit}</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: explanation ? 10 : 0 }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: isEdited ? '#f59e0b' : 'var(--accent)', cursor: 'pointer', height: 4 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v))) }}
            style={{
              width: 58, padding: '5px 8px', borderRadius: 7, textAlign: 'right',
              border: `1px solid ${isEdited ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
              background: 'var(--bg-card)',
              color: isEdited ? '#f59e0b' : 'var(--text-primary)',
              fontSize: 13, fontWeight: 700, outline: 'none',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = isEdited ? '#f59e0b' : 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = isEdited ? 'rgba(245,158,11,0.4)' : 'var(--border)'}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 14 }}>{unit}</span>
        </div>
      </div>

      {explanation && (
        <div style={{
          background: 'rgba(99,102,241,0.06)', borderRadius: 8, padding: '8px 12px',
          borderLeft: '2px solid rgba(99,102,241,0.35)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-light)', marginRight: 6 }}>AI</span>
            {explanation}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Modes ──────────────────────────────────────────────────────────────────
const MODES = [
  { id: 'full_ai',    label: '✨ Full AI',       desc: 'AI fills & explains everything' },
  { id: 'ai_suggest', label: '🔀 AI + Manual',   desc: 'AI suggests, you adjust'       },
  { id: 'manual',     label: '✏️ Manual',        desc: 'You enter all assumptions'      },
]

const QUICK = ['AAPL', 'NVDA', 'META', 'MSFT', 'GOOGL', 'TSLA', 'AMZN']

// ── Main ───────────────────────────────────────────────────────────────────
export default function DCF() {
  const [mode,        setMode]        = useState('ai_suggest')
  const [searchInput, setSearchInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDrop,    setShowDrop]    = useState(false)
  const [activeIdx,   setActiveIdx]   = useState(-1)
  const debounceRef   = useRef(null)
  const searchRef     = useRef(null)
  const [stockData,   setStockData]   = useState(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError,   setDataError]   = useState(null)

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const [aiLoading,   setAiLoading]   = useState(false)
  const [asm,         setAsm]         = useState(DEFAULTS)
  const [aiExp,       setAiExp]       = useState({})
  const [aiConf,      setAiConf]      = useState({})
  const [aiSummary,   setAiSummary]   = useState('')
  const [aiOriginal,  setAiOriginal]  = useState(null)
  const [edited,      setEdited]      = useState(new Set())
  const [showPrefs,   setShowPrefs]   = useState(false)
  const [aiToggles,   setAiToggles]   = useState({
    revenue_growth: true, ebit_margin: true, wacc: true, terminal_growth: true, capex: true,
  })

  // ── Derived financials for math
  const financials = useMemo(() => stockData ? {
    revenue:          stockData.revenue,
    netDebt:          stockData.net_debt,
    sharesOutstanding:stockData.shares_outstanding,
  } : null, [stockData])

  const results   = useMemo(() => financials ? computeDCF(financials, asm) : null, [financials, asm])

  const scenarios = useMemo(() => {
    if (!financials || !results) return null
    return {
      bull: computeDCF(financials, { ...asm, nearGrowth: asm.nearGrowth + 5, longGrowth: asm.longGrowth + 3, ebitMargin: Math.min(65, asm.ebitMargin + 3), wacc: Math.max(5, asm.wacc - 1) }),
      base: results,
      bear: computeDCF(financials, { ...asm, nearGrowth: Math.max(0, asm.nearGrowth - 5), longGrowth: Math.max(0, asm.longGrowth - 3), ebitMargin: Math.max(1, asm.ebitMargin - 3), wacc: asm.wacc + 1 }),
    }
  }, [financials, asm, results])

  const sensitivity = useMemo(() => {
    if (!financials) return null
    return WACC_RANGE.map(w =>
      TG_RANGE.map(tg => {
        const r = computeDCF(financials, { ...asm, wacc: w, terminalGrowth: tg })
        return r ? Math.round(r.pricePerShare) : null
      })
    )
  }, [financials, asm])

  // ── Helpers
  function set(key, val) {
    setAsm(prev => ({ ...prev, [key]: val }))
    setEdited(prev => new Set([...prev, key]))
  }

  function resetToAI()   { if (aiOriginal) { setAsm(aiOriginal); setEdited(new Set()) } }
  function resetToBear() { setAsm(prev => ({ ...prev, nearGrowth: Math.max(0, prev.nearGrowth - 6), longGrowth: Math.max(0, prev.longGrowth - 3), ebitMargin: Math.max(1, prev.ebitMargin - 4), wacc: prev.wacc + 2, terminalGrowth: Math.max(1, prev.terminalGrowth - 0.5) })); setEdited(new Set(['nearGrowth','longGrowth','ebitMargin','wacc','terminalGrowth'])) }
  function resetToBull() { setAsm(prev => ({ ...prev, nearGrowth: prev.nearGrowth + 6, longGrowth: prev.longGrowth + 3, ebitMargin: Math.min(65, prev.ebitMargin + 4), wacc: Math.max(5, prev.wacc - 2), terminalGrowth: Math.min(5, prev.terminalGrowth + 0.5) })); setEdited(new Set(['nearGrowth','longGrowth','ebitMargin','wacc','terminalGrowth'])) }

  // ── AI call
  async function runAI(data) {
    if (!data) return
    setAiLoading(true)
    try {
      const res = await axios.post(`${API}/dcf/assumptions`, {
        symbol: data.symbol, name: data.name, sector: data.sector || '',
        revenue: data.revenue, revenue_growth_yoy: data.revenue_growth_yoy,
        ebit_margin: data.ebit_margin, beta: data.beta,
        fcf_margin: data.fcf_margin, capex_pct: data.capex_pct,
        da_pct: data.da_pct, net_debt: data.net_debt,
        ai_toggles: aiToggles,
      })
      const ai = res.data
      const next = {
        forecastYears: ai.forecast_years   ?? asm.forecastYears,
        nearGrowth:    ai.near_growth      ?? asm.nearGrowth,
        longGrowth:    ai.long_growth      ?? asm.longGrowth,
        ebitMargin:    ai.ebit_margin      ?? asm.ebitMargin,
        taxRate:       ai.tax_rate         ?? asm.taxRate,
        capexPct:      ai.capex_pct        ?? asm.capexPct,
        daPct:         ai.da_pct           ?? asm.daPct,
        wcPct:         ai.wc_pct           ?? asm.wcPct,
        wacc:          ai.wacc             ?? asm.wacc,
        terminalGrowth:ai.terminal_growth  ?? asm.terminalGrowth,
      }
      setAsm(next)
      setAiOriginal(next)
      setEdited(new Set())
      setAiExp(ai.explanations || {})
      setAiConf(ai.confidence  || {})
      setAiSummary(ai.summary  || '')
    } catch (e) {
      console.error('AI assumptions failed', e)
    } finally {
      setAiLoading(false)
    }
  }

  // ── Autocomplete
  function handleSearchChange(e) {
    const val = e.target.value
    setSearchInput(val)
    setActiveIdx(-1)
    clearTimeout(debounceRef.current)
    if (val.trim().length < 1) { setSuggestions([]); setShowDrop(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/search?q=${encodeURIComponent(val.trim())}`)
        setSuggestions(data)
        setShowDrop(data.length > 0)
      } catch { setSuggestions([]); setShowDrop(false) }
    }, 250)
  }

  function handleSearchKey(e) {
    if (!showDrop || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeIdx].symbol) }
    else if (e.key === 'Escape') setShowDrop(false)
  }

  function selectSuggestion(sym) {
    setSearchInput(sym)
    setShowDrop(false)
    setSuggestions([])
    loadSymbol(sym)
  }

  // ── Load stock
  async function handleLoad(e) {
    e.preventDefault()
    const sym = searchInput.trim().toUpperCase()
    if (sym) loadSymbol(sym)
  }

  async function loadSymbol(sym) {
    sym = sym.toUpperCase()
    if (!sym) return
    setDataLoading(true)
    setDataError(null)
    setAiSummary('')
    setAiExp({})
    setAiConf({})
    setAiOriginal(null)
    setEdited(new Set())
    try {
      const res = await axios.get(`${API}/dcf/data/${sym}`)
      setStockData(res.data)
      // Pre-fill non-AI fields from real data
      setAsm(prev => ({
        ...prev,
        taxRate:    res.data.effective_tax_rate ?? prev.taxRate,
        capexPct:   res.data.capex_pct          ?? prev.capexPct,
        daPct:      res.data.da_pct             ?? prev.daPct,
        ebitMargin: res.data.ebit_margin        ?? prev.ebitMargin,
      }))
      if (mode !== 'manual') await runAI(res.data)
    } catch (err) {
      setDataError(err.response?.data?.detail || `Could not load "${sym}"`)
    } finally {
      setDataLoading(false)
    }
  }

  const upside  = results && stockData?.price ? (results.pricePerShare / stockData.price - 1) * 100 : null
  const mos     = results && stockData?.price ? (results.pricePerShare - stockData.price) / results.pricePerShare * 100 : null
  const isUp    = upside !== null && upside >= 0

  // ── Render
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }} className="fade-in">
      {/* ── PAGE HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
          📐 DCF Valuation
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          AI-powered Discounted Cash Flow model with real financial data and company-specific assumptions
        </p>
      </div>

      {/* ── MODE TOGGLE ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: '10px 20px', borderRadius: 10, border: `1px solid ${mode === m.id ? 'transparent' : 'var(--border)'}`,
            background: mode === m.id ? 'var(--accent)' : 'var(--bg-card)',
            color: mode === m.id ? 'white' : 'var(--text-muted)',
            fontWeight: mode === m.id ? 700 : 400, fontSize: 13, cursor: 'pointer',
            textAlign: 'left',
          }}>
            <div>{m.label}</div>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* ── SEARCH ── */}
      <div ref={searchRef} style={{ position: 'relative', marginBottom: dataError ? 8 : 16 }}>
        <form onSubmit={handleLoad} style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', fontSize: 15, pointerEvents: 'none',
            }}>🔍</span>
            <input
              value={searchInput}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKey}
              onFocus={() => suggestions.length > 0 && setShowDrop(true)}
              placeholder="Search stock symbol or company name…"
              autoComplete="off"
              style={{
                width: '100%', padding: '13px 18px 13px 42px', borderRadius: 12,
                border: `1px solid ${showDrop ? 'var(--accent)' : 'var(--border)'}`,
                background: 'var(--bg-card)', color: 'var(--text-primary)',
                fontSize: 15, outline: 'none', transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => { if (!showDrop) e.target.style.borderColor = 'var(--border)' }}
            />
          </div>
          <button type="submit" disabled={dataLoading} style={{
            padding: '13px 32px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14,
            background: dataLoading ? 'var(--bg-card-hover)' : 'linear-gradient(135deg, #6366f1, #818cf8)',
            color: dataLoading ? 'var(--text-muted)' : 'white',
            cursor: dataLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}>
            {dataLoading ? '⏳ Loading…' : '⚡ Analyze'}
          </button>
        </form>

        {/* Dropdown */}
        {showDrop && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            right: 50, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, zIndex: 100, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {suggestions.map((s, i) => (
              <div key={s.symbol} onMouseDown={() => selectSuggestion(s.symbol)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 16px', cursor: 'pointer',
                  background: i === activeIdx ? 'var(--bg-card-hover)' : 'transparent',
                  borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = i === activeIdx ? 'var(--bg-card-hover)' : 'transparent'}
              >
                <span style={{
                  background: 'var(--accent-dim)', color: 'var(--accent-light)',
                  padding: '3px 8px', borderRadius: 6, fontSize: 12,
                  fontWeight: 700, minWidth: 52, textAlign: 'center',
                }}>{s.symbol}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {s.type === 'ETF' ? 'ETF' : s.exchange}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {dataError && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{dataError}</p>}

      {/* ── AI PREFERENCES ── */}
      {mode !== 'manual' && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setShowPrefs(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: '1px solid var(--border)', borderRadius: 10,
            padding: '8px 14px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12,
          }}>
            ⚙️ AI Preferences {showPrefs ? '▲' : '▼'}
          </button>
          {showPrefs && (
            <div style={{
              marginTop: 8, background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Choose what AI estimates for you:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries({ revenue_growth: 'Revenue Growth', ebit_margin: 'Operating Margin', wacc: 'WACC', terminal_growth: 'Terminal Growth', capex: 'CapEx & D&A' }).map(([k, label]) => (
                  <label key={k} style={{
                    display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                    padding: '7px 12px', borderRadius: 8, fontSize: 12,
                    background: aiToggles[k] ? 'rgba(99,102,241,0.1)' : 'var(--bg-primary)',
                    border: `1px solid ${aiToggles[k] ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                  }}>
                    <input type="checkbox" checked={aiToggles[k]}
                      onChange={e => setAiToggles(prev => ({ ...prev, [k]: e.target.checked }))}
                      style={{ accentColor: 'var(--accent)' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!stockData && !dataLoading && (
        <div style={{ textAlign: 'center', padding: '60px 0 40px' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📐</div>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 8 }}>Enter a stock symbol to begin</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
            AI fetches real financials and generates company-specific DCF assumptions
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {QUICK.map(sym => (
              <button key={sym} onClick={() => { setSearchInput(sym); loadSymbol(sym) }} style={{
                padding: '8px 18px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
              }}>{sym}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {stockData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── COMPANY BANNER ── */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
            padding: '18px 24px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-light)' }}>{stockData.symbol}</span>
                <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{stockData.name}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{stockData.sector}{stockData.industry ? ` · ${stockData.industry}` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[['Price', `$${stockData.price}`], ['Market Cap', fmtM(stockData.market_cap)], ['EV', fmtM(stockData.enterprise_value)], ['Beta', stockData.beta?.toFixed(2) ?? '—']].map(([l, v]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{l}</p>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{v}</p>
                </div>
              ))}
            </div>
            {mode !== 'manual' && (
              <button onClick={() => runAI(stockData)} disabled={aiLoading} style={{
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: aiLoading ? 'var(--bg-card-hover)' : 'linear-gradient(135deg, #6366f1, #818cf8)',
                color: aiLoading ? 'var(--text-muted)' : 'white',
                fontWeight: 700, fontSize: 13, cursor: aiLoading ? 'not-allowed' : 'pointer',
              }}>
                {aiLoading ? '⏳ Re-running…' : '✨ Re-run AI'}
              </button>
            )}
          </div>

          {/* ── AI LOADING SKELETON ── */}
          {aiLoading && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'ping 1s infinite' }} />
                AI is analyzing {stockData.symbol}…
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[...Array(9)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
              </div>
            </div>
          )}

          {/* ── MAIN 2-COL LAYOUT ── */}
          {!aiLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 20, alignItems: 'start' }}>

              {/* ────── LEFT COLUMN ────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Financial Overview */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📊 Financial Overview</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    <KV label="Revenue"        value={fmtB(stockData.revenue)} />
                    <KV label="EBIT"           value={fmtB(stockData.ebit)} />
                    <KV label="EBIT Margin"    value={stockData.ebit_margin != null ? `${stockData.ebit_margin}%` : '—'} />
                    <KV label="Free Cash Flow" value={fmtB(stockData.free_cash_flow)} />
                    <KV label="FCF Margin"     value={stockData.fcf_margin != null ? `${stockData.fcf_margin}%` : '—'} />
                    <KV label="Net Income"     value={fmtB(stockData.net_income)} />
                    <KV label="Total Cash"     value={fmtM(stockData.total_cash)} />
                    <KV label="Total Debt"     value={fmtM(stockData.total_debt)} />
                    <KV label="Net Debt"       value={fmtB(stockData.net_debt)} />
                  </div>
                  {stockData.revenue_history?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Revenue History ($B)</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 50 }}>
                        {stockData.revenue_history.map((r, i) => {
                          const maxRev = Math.max(...stockData.revenue_history.map(x => x.revenue))
                          const h = Math.max(12, (r.revenue / maxRev) * 46)
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>${r.revenue}B</span>
                              <div style={{ width: '100%', height: h, background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.7 + i * 0.1 }} />
                              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.year}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Assumptions Panel */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <p style={{ fontWeight: 700, fontSize: 14 }}>⚙️ DCF Assumptions</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {aiOriginal && (
                        <button onClick={resetToAI} title="Reset to AI assumptions" style={{
                          padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.35)',
                          background: 'rgba(99,102,241,0.08)', color: 'var(--accent-light)',
                          fontSize: 11, cursor: 'pointer', fontWeight: 700,
                        }}>↺ AI</button>
                      )}
                      <button onClick={resetToBear} style={{
                        padding: '5px 11px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                        border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444',
                      }}>🐻 Bear</button>
                      <button onClick={resetToBull} style={{
                        padding: '5px 11px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                        border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)', color: '#22c55e',
                      }}>🚀 Bull</button>
                    </div>
                  </div>

                  {/* Growth section — highlighted */}
                  <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-light)', background: 'rgba(99,102,241,0.15)', padding: '2px 9px', borderRadius: 20 }}>
                        {mode === 'manual' ? 'YOUR FORECAST' : 'GROWTH ASSUMPTIONS'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <AsmInput label="Near-term Growth (Y1–5)" tipKey="nearGrowth" value={asm.nearGrowth} min={0} max={60} step={0.5} unit="%" onChange={v => set('nearGrowth', v)} onReset={() => { setAsm(p => ({ ...p, nearGrowth: aiOriginal.nearGrowth })); setEdited(p => { const n = new Set(p); n.delete('nearGrowth'); return n }) }} explanation={aiExp.revenue_growth} confidence={aiConf.revenue_growth} isEdited={edited.has('nearGrowth')} aiValue={aiOriginal?.nearGrowth} />
                      <AsmInput label="Long-term Growth (Y6–10)" tipKey="longGrowth" value={asm.longGrowth} min={0} max={40} step={0.5} unit="%" onChange={v => set('longGrowth', v)} onReset={() => { setAsm(p => ({ ...p, longGrowth: aiOriginal.longGrowth })); setEdited(p => { const n = new Set(p); n.delete('longGrowth'); return n }) }} isEdited={edited.has('longGrowth')} aiValue={aiOriginal?.longGrowth} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AsmInput label="Operating Margin (EBIT%)" tipKey="ebitMargin" value={asm.ebitMargin} min={1} max={70} step={0.5} unit="%" onChange={v => set('ebitMargin', v)} onReset={() => { setAsm(p => ({ ...p, ebitMargin: aiOriginal.ebitMargin })); setEdited(p => { const n = new Set(p); n.delete('ebitMargin'); return n }) }} explanation={aiExp.ebit_margin} confidence={aiConf.ebit_margin} isEdited={edited.has('ebitMargin')} aiValue={aiOriginal?.ebitMargin} />
                    <AsmInput label="Tax Rate" tipKey="taxRate" value={asm.taxRate} min={0} max={40} step={0.5} unit="%" onChange={v => set('taxRate', v)} onReset={() => { setAsm(p => ({ ...p, taxRate: aiOriginal.taxRate })); setEdited(p => { const n = new Set(p); n.delete('taxRate'); return n }) }} isEdited={edited.has('taxRate')} aiValue={aiOriginal?.taxRate} />
                    <AsmInput label="CapEx % of Revenue" tipKey="capexPct" value={asm.capexPct} min={0} max={30} step={0.5} unit="%" onChange={v => set('capexPct', v)} onReset={() => { setAsm(p => ({ ...p, capexPct: aiOriginal.capexPct })); setEdited(p => { const n = new Set(p); n.delete('capexPct'); return n }) }} explanation={aiExp.capex} confidence={aiConf.capex} isEdited={edited.has('capexPct')} aiValue={aiOriginal?.capexPct} />
                    <AsmInput label="D&A % of Revenue" tipKey="daPct" value={asm.daPct} min={0} max={20} step={0.5} unit="%" onChange={v => set('daPct', v)} onReset={() => { setAsm(p => ({ ...p, daPct: aiOriginal.daPct })); setEdited(p => { const n = new Set(p); n.delete('daPct'); return n }) }} isEdited={edited.has('daPct')} aiValue={aiOriginal?.daPct} />
                    <AsmInput label="Working Capital % of ΔRevenue" tipKey="wcPct" value={asm.wcPct} min={-5} max={20} step={0.5} unit="%" onChange={v => set('wcPct', v)} onReset={() => { setAsm(p => ({ ...p, wcPct: aiOriginal.wcPct })); setEdited(p => { const n = new Set(p); n.delete('wcPct'); return n }) }} isEdited={edited.has('wcPct')} aiValue={aiOriginal?.wcPct} />
                  </div>

                  {/* Valuation assumptions — highlighted */}
                  <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-light)', background: 'rgba(99,102,241,0.15)', padding: '2px 9px', borderRadius: 20 }}>
                        DISCOUNT ASSUMPTIONS
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <AsmInput label="WACC" tipKey="wacc" value={asm.wacc} min={5} max={20} step={0.25} unit="%" onChange={v => set('wacc', v)} onReset={() => { setAsm(p => ({ ...p, wacc: aiOriginal.wacc })); setEdited(p => { const n = new Set(p); n.delete('wacc'); return n }) }} explanation={aiExp.wacc} confidence={aiConf.wacc} isEdited={edited.has('wacc')} aiValue={aiOriginal?.wacc} />
                      <AsmInput label="Terminal Growth Rate" tipKey="terminalGrowth" value={asm.terminalGrowth} min={0} max={5} step={0.25} unit="%" onChange={v => set('terminalGrowth', v)} onReset={() => { setAsm(p => ({ ...p, terminalGrowth: aiOriginal.terminalGrowth })); setEdited(p => { const n = new Set(p); n.delete('terminalGrowth'); return n }) }} explanation={aiExp.terminal_growth} confidence={aiConf.terminal_growth} isEdited={edited.has('terminalGrowth')} aiValue={aiOriginal?.terminalGrowth} />
                    </div>
                    {asm.wacc <= asm.terminalGrowth && (
                      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#fca5a5', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span>⚠️</span>
                        <span>Terminal Growth ({asm.terminalGrowth}%) must be less than WACC ({asm.wacc}%). The DCF model is undefined when growth ≥ discount rate. Reduce Terminal Growth or increase WACC.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ────── RIGHT COLUMN ────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {results ? (
                  <>
                    {/* Main result */}
                    <div style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 22,
                      borderTop: `3px solid ${isUp ? '#22c55e' : '#ef4444'}`,
                    }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>🎯 Valuation Result</p>

                      <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Intrinsic Value Per Share</p>
                        <p style={{ fontSize: 44, fontWeight: 900, color: 'var(--accent-light)', lineHeight: 1, letterSpacing: '-1px' }}>
                          ${results.pricePerShare.toFixed(2)}
                        </p>
                        {stockData.price && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                            vs market price <strong style={{ color: 'var(--text-primary)' }}>${stockData.price}</strong>
                          </p>
                        )}
                      </div>

                      {upside !== null && (
                        <div style={{
                          padding: '16px', borderRadius: 12, textAlign: 'center', marginBottom: 16,
                          background: isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                          border: `1px solid ${isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                        }}>
                          <p style={{ fontSize: 32, fontWeight: 900, color: isUp ? '#22c55e' : '#ef4444', letterSpacing: '-1px' }}>
                            {isUp ? '+' : ''}{upside.toFixed(1)}%
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {isUp ? 'Potential upside from market price' : 'Potential downside from market price'}
                          </p>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <KV label="Enterprise Value" value={fmtB(results.ev)} />
                        <KV label="Equity Value" value={fmtB(results.equity)} />
                        <KV label="PV of FCFs" value={fmtB(results.pvFCF)} />
                        <KV label="PV of Terminal Value" value={fmtB(results.pvTV)} sub={`${results.tvPct.toFixed(0)}% of EV`} />
                      </div>

                      {mos !== null && (
                        <div style={{
                          padding: '10px 14px', borderRadius: 10, background: 'var(--bg-primary)',
                          border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Margin of Safety</span>
                            <Tip k="marginOfSafety" />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 14, color: mos >= 0 ? '#22c55e' : '#ef4444' }}>
                            {mos >= 0 ? '+' : ''}{mos.toFixed(1)}%
                          </span>
                        </div>
                      )}

                      {results.tvPct > 70 && (
                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 11, color: '#f59e0b', lineHeight: 1.5 }}>
                          ⚠️ {results.tvPct.toFixed(0)}% of value is from terminal value — highly sensitive to WACC and terminal growth.
                          <Tip k="tvPct" />
                        </div>
                      )}
                    </div>

                    {/* Scenarios */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📊 Scenario Analysis</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        {[
                          { label: '🐻 Bear', r: scenarios?.bear, color: '#ef4444' },
                          { label: '📊 Base', r: scenarios?.base, color: '#6366f1' },
                          { label: '🚀 Bull', r: scenarios?.bull, color: '#22c55e' },
                        ].map(({ label, r, color }) => (
                          <div key={label} style={{
                            textAlign: 'center', padding: '14px 8px', borderRadius: 10,
                            background: `${color}10`, border: `1px solid ${color}28`,
                          }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 5 }}>{label}</p>
                            <p style={{ fontSize: 19, fontWeight: 800, color, lineHeight: 1 }}>
                              {r ? `$${r.pricePerShare.toFixed(0)}` : '—'}
                            </p>
                            {r && stockData?.price && (
                              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                {((r.pricePerShare / stockData.price - 1) * 100).toFixed(0)}%
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI Summary */}
                    {aiSummary && (
                      <div style={{
                        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: 16, padding: 20,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 16 }}>🤖</span>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>AI Valuation Context</span>
                        </div>
                        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{aiSummary}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 16, padding: 24, textAlign: 'center', color: '#ef4444', fontSize: 13,
                  }}>
                    ⚠️ WACC must be greater than Terminal Growth Rate to compute a valid valuation.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHARTS + SENSITIVITY ── */}
          {!aiLoading && results && (
            <>
              {/* Projection charts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { key: 'revenue', label: 'Revenue Projection ($B)', color: '#6366f1', id: 'revGrad' },
                  { key: 'fcf',     label: 'Free Cash Flow Projection ($B)', color: '#22c55e', id: 'fcfGrad' },
                ].map(({ key, label, color, id }) => (
                  <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>{label}</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={results.projections} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}B`} width={56} />
                        <Tooltip formatter={v => [`$${v.toFixed(1)}B`, key === 'revenue' ? 'Revenue' : 'FCF']} contentStyle={{ background: '#1a1f35', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                        <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2} fill={`url(#${id})`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>

              {/* Sensitivity Table */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🔬 Sensitivity Analysis</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Price per share · Rows: WACC · Columns: Terminal Growth Rate
                    {stockData?.price && <span style={{ marginLeft: 10, color: '#22c55e' }}>● Green = above market price ${stockData.price}</span>}
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '9px 14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                          WACC \ TG
                        </th>
                        {TG_RANGE.map(tg => (
                          <th key={tg} style={{
                            padding: '9px 10px', textAlign: 'center', fontWeight: 700,
                            borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)',
                            color: tg === asm.terminalGrowth ? 'var(--accent-light)' : 'var(--text-muted)',
                          }}>{tg}%</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {WACC_RANGE.map((w, wi) => (
                        <tr key={w}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{
                            padding: '9px 14px', textAlign: 'center', fontWeight: 700,
                            color: w === asm.wacc ? 'var(--accent-light)' : 'var(--text-muted)',
                            background: 'var(--bg-primary)', borderRight: '1px solid var(--border)',
                          }}>{w}%</td>
                          {(sensitivity?.[wi] || []).map((price, ci) => {
                            const tg     = TG_RANGE[ci]
                            const isBase = w === asm.wacc && tg === asm.terminalGrowth
                            const green  = stockData?.price && price > stockData.price
                            return (
                              <td key={ci} style={{
                                padding: '9px 10px', textAlign: 'center',
                                fontWeight: isBase ? 800 : 400,
                                color: isBase ? 'var(--accent-light)' : green ? '#22c55e' : 'var(--text-primary)',
                                background: isBase ? 'rgba(99,102,241,0.12)' : 'transparent',
                              }}>
                                {price !== null ? `$${price}` : '—'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Disclaimer */}
              <div style={{
                background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)',
                borderRadius: 12, padding: '12px 18px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7,
              }}>
                ⚠️ <strong style={{ color: '#f59e0b' }}>Educational purposes only.</strong> This model uses simplified assumptions and publicly available data. Real-world valuations require detailed financial modeling, industry benchmarking, and professional judgment. This is not financial advice.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
