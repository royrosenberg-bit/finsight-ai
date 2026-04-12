import { useState, useEffect } from 'react'
import axios from 'axios'
import StockCard from '../components/StockCard'
import { CardSkeleton } from '../components/Skeleton'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

const TRENDING = ['AAPL', 'TSLA', 'NVDA', 'META', 'MSFT', 'AMZN', 'GOOGL', 'AMD']

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
  const bg = isPos ? 'var(--green-dim)' : 'var(--red-dim)'
  return (
    <div className="card" style={{ flex: 1, minWidth: 160 }}>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{name}</p>
      <p style={{ fontSize: '22px', fontWeight: 700 }}>
        {price != null ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </p>
      {changePct != null && (
        <span style={{ fontSize: '13px', fontWeight: 600, color, background: bg, padding: '2px 8px', borderRadius: '20px', display: 'inline-block', marginTop: 6 }}>
          {formatPct(changePct)}
        </span>
      )}
    </div>
  )
}

function MoverRow({ s, color, onSelectStock }) {
  return (
    <div onClick={() => onSelectStock(s.symbol)} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: 'pointer', padding: '8px 10px', borderRadius: 8, transition: 'background 0.12s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div>
        <span style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: 13 }}>{s.symbol}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{formatPrice(s.price)}</span>
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 13 }}>{formatPct(s.change_pct)}</span>
    </div>
  )
}

export default function Dashboard({ onSelectStock }) {
  const [indices, setIndices] = useState([])
  const [indicesLoading, setIndicesLoading] = useState(true)
  const [trending, setTrending] = useState([])
  const [loadingTrending, setLoadingTrending] = useState(true)

  useEffect(() => {
    setIndicesLoading(true)
    axios.get(`${API}/indices`)
      .then(r => { setIndices(r.data); setIndicesLoading(false) })
      .catch(() => setIndicesLoading(false))

    setLoadingTrending(true)
    Promise.allSettled(
      TRENDING.map(sym => axios.get(`${API}/stock/${sym}`).then(r => r.data))
    ).then(results => {
      const stocks = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
      setTrending(stocks)
      setLoadingTrending(false)
    })
  }, [])

  // Only show actual gainers (positive) and actual losers (negative)
  const gainers = [...trending]
    .filter(s => s.change_pct != null && s.change_pct > 0)
    .sort((a, b) => b.change_pct - a.change_pct)
    .slice(0, 4)

  const losers = [...trending]
    .filter(s => s.change_pct != null && s.change_pct < 0)
    .sort((a, b) => a.change_pct - b.change_pct)
    .slice(0, 4)

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Market Overview */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Market Overview
        </h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {indicesLoading
            ? [1, 2, 3].map(i => <CardSkeleton key={i} />)
            : indices.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>Market data unavailable</p>
              : indices.map(idx => (
                <IndexCard key={idx.name} name={idx.name} price={idx.price} changePct={idx.change_pct} />
              ))
          }
        </div>
      </section>

      {/* Trending */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
          🔥 Trending Stocks
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {loadingTrending
            ? TRENDING.map(s => <CardSkeleton key={s} />)
            : trending.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Could not load trending stocks</p>
              : trending.map(s => <StockCard key={s.symbol} data={s} onClick={onSelectStock} />)
          }
        </div>
      </section>

      {/* Gainers & Losers */}
      {!loadingTrending && trending.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          <section className="card">
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--green)', marginBottom: 14 }}>
              📈 Top Gainers
            </h2>
            {gainers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No gainers in this set today</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {gainers.map(s => <MoverRow key={s.symbol} s={s} color="var(--green)" onSelectStock={onSelectStock} />)}
              </div>
            )}
          </section>

          <section className="card">
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--red)', marginBottom: 14 }}>
              📉 Top Losers
            </h2>
            {losers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No losers in this set today</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {losers.map(s => <MoverRow key={s.symbol} s={s} color="var(--red)" onSelectStock={onSelectStock} />)}
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  )
}
