import { useState, useEffect } from 'react'
import axios from 'axios'
import StockCard from '../components/StockCard'
import { CardSkeleton } from '../components/Skeleton'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

// Section B: curated large-cap watch list
const LARGE_CAP = ['AAPL', 'MSFT', 'NVDA', 'META', 'TSLA', 'AMZN', 'GOOGL', 'JPM']

function formatPct(val) {
  if (val == null) return '—'
  const n = parseFloat(val)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function formatPrice(val) {
  if (val == null) return '—'
  return `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function IndexCard({ name, price, changePct }) {
  const isPos = changePct >= 0
  const color = isPos ? 'var(--green)' : 'var(--red)'
  const bg    = isPos ? 'var(--green-dim)' : 'var(--red-dim)'
  return (
    <div className="card" style={{ flex: 1, minWidth: 160 }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{name}</p>
      <p style={{ fontSize: 22, fontWeight: 700 }}>
        {price != null ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </p>
      {changePct != null && (
        <span style={{ fontSize: 13, fontWeight: 600, color, background: bg, padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginTop: 6 }}>
          {formatPct(changePct)}
        </span>
      )}
    </div>
  )
}

function MoverRow({ s, isGainer, onSelectStock }) {
  const color = isGainer ? 'var(--green)' : 'var(--red)'
  const badgeBg = isGainer ? 'var(--green-dim)' : 'var(--red-dim)'
  return (
    <div
      onClick={() => onSelectStock(s.symbol)}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '9px 12px', borderRadius: 10, transition: 'background 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: 13 }}>{s.symbol}</span>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{s.name}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{formatPrice(s.price)}</p>
        <span style={{ fontSize: 12, fontWeight: 700, color, background: badgeBg, padding: '1px 7px', borderRadius: 20, display: 'inline-block', marginTop: 2 }}>
          {formatPct(s.change_pct)}
        </span>
      </div>
    </div>
  )
}

function MoverColumn({ title, items, isGainer, loading, onSelectStock }) {
  const color = isGainer ? 'var(--green)' : 'var(--red)'
  const icon  = isGainer ? '📈' : '📉'
  return (
    <section className="card" style={{ flex: 1 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 14 }}>{icon} {title}</h3>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 48 }} />)}
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
          {isGainer ? 'No gainers available right now' : 'No losers available right now'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map(s => <MoverRow key={s.symbol} s={s} isGainer={isGainer} onSelectStock={onSelectStock} />)}
        </div>
      )}
    </section>
  )
}

export default function Dashboard({ onSelectStock }) {
  const [indices,       setIndices]       = useState([])
  const [indicesErr,    setIndicesErr]     = useState(false)
  const [indicesLoading,setIndicesLoading] = useState(true)

  // Section A: market-wide movers
  const [movers,        setMovers]        = useState({ gainers: [], losers: [], source: '', timestamp: '' })
  const [moversLoading, setMoversLoading] = useState(true)
  const [moversErr,     setMoversErr]     = useState(false)

  // Section B: large-cap watch
  const [largeCap,      setLargeCap]      = useState([])
  const [largeCapLoading, setLargeCapLoading] = useState(true)

  useEffect(() => {
    // Indices
    axios.get(`${API}/indices`)
      .then(r => { setIndices(r.data); setIndicesLoading(false) })
      .catch(() => { setIndicesErr(true); setIndicesLoading(false) })

    // Market-wide movers (new endpoint)
    axios.get(`${API}/movers`)
      .then(r => { setMovers(r.data); setMoversLoading(false) })
      .catch(() => { setMoversErr(true); setMoversLoading(false) })

    // Large-cap watch
    Promise.allSettled(
      LARGE_CAP.map(sym => axios.get(`${API}/stock/${sym}`).then(r => r.data))
    ).then(results => {
      setLargeCap(results.filter(r => r.status === 'fulfilled').map(r => r.value))
      setLargeCapLoading(false)
    })
  }, [])

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Market Overview ───────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Market Overview
        </h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {indicesLoading
            ? [1,2,3].map(i => <CardSkeleton key={i} />)
            : indicesErr || indices.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>Market data unavailable</p>
              : indices.map(idx => (
                  <IndexCard key={idx.name} name={idx.name} price={idx.price} changePct={idx.change_pct} />
                ))
          }
        </div>
      </section>

      {/* ── Section A: Market-Wide Movers ─────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Market Movers
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            Biggest % moves across listed equities today
          </span>
          {!moversLoading && movers.timestamp && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Updated {movers.timestamp}
            </span>
          )}
        </div>

        {moversErr ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Could not load market movers</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <MoverColumn
              title="Top Gainers"
              items={movers.gainers}
              isGainer={true}
              loading={moversLoading}
              onSelectStock={onSelectStock}
            />
            <MoverColumn
              title="Top Losers"
              items={movers.losers}
              isGainer={false}
              loading={moversLoading}
              onSelectStock={onSelectStock}
            />
          </div>
        )}

        {/* Source label */}
        {!moversLoading && movers.source && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
            Source: {movers.source}
          </p>
        )}
      </section>

      {/* ── Section B: Large-Cap Watch ────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Large-Cap Watch
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            Curated — S&P 500 blue chips
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {largeCapLoading
            ? LARGE_CAP.map(s => <CardSkeleton key={s} />)
            : largeCap.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Could not load stocks</p>
              : largeCap.map(s => <StockCard key={s.symbol} data={s} onClick={onSelectStock} />)
          }
        </div>
      </section>

    </div>
  )
}
