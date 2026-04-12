import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { TableSkeleton } from '../components/Skeleton'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

function fmt(val, prefix = '') {
  if (val == null) return '—'
  if (prefix === '$' && val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (prefix === '$' && val >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`
  if (prefix === '$' && val >= 1e6)  return `$${(val / 1e6).toFixed(2)}M`
  return `${prefix}${val}`
}

const SECTORS = ['All', 'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
  'Communication Services', 'Industrials', 'Consumer Defensive', 'Energy', 'Real Estate', 'Utilities', 'Basic Materials']

export default function Screener({ onSelectStock }) {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [sortBy, setSortBy] = useState('market_cap')
  const [sortDir, setSortDir] = useState('desc')
  const [sector, setSector] = useState('All')
  const [minCap, setMinCap] = useState('')
  const [maxPE, setMaxPE] = useState('')

  useEffect(() => {
    axios.get(`${API}/screener`)
      .then(r => { setStocks(r.data); setLoading(false) })
      .catch(() => { setFetchError('Could not load screener data.'); setLoading(false) })
  }, [])

  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let data = [...stocks]
    if (sector !== 'All') data = data.filter(s => s.sector === sector)
    if (minCap) data = data.filter(s => s.market_cap && s.market_cap >= parseFloat(minCap) * 1e9)
    if (maxPE) data = data.filter(s => s.pe_ratio && s.pe_ratio <= parseFloat(maxPE))
    data.sort((a, b) => {
      const av = a[sortBy] ?? (typeof b[sortBy] === 'number' ? -Infinity : '')
      const bv = b[sortBy] ?? (typeof a[sortBy] === 'number' ? -Infinity : '')
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return data
  }, [stocks, sector, minCap, maxPE, sortBy, sortDir])

  const SortIcon = ({ col }) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>📉 Stock Screener</h2>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{filtered.length} stocks</span>
      </div>

      {/* Filters */}
      <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Sector</label>
          <select value={sector} onChange={e => setSector(e.target.value)} style={{
            padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', cursor: 'pointer',
          }}>
            {SECTORS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Min Market Cap ($B)</label>
          <input
            type="number" value={minCap} onChange={e => setMinCap(e.target.value)}
            placeholder="e.g. 100"
            style={{
              padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', width: 130,
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Max P/E Ratio</label>
          <input
            type="number" value={maxPE} onChange={e => setMaxPE(e.target.value)}
            placeholder="e.g. 30"
            style={{
              padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', width: 130,
            }}
          />
        </div>
        <button onClick={() => { setSector('All'); setMinCap(''); setMaxPE('') }} style={{
          padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
        }}>
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20 }}><TableSkeleton rows={10} /></div>
        ) : fetchError ? (
          <div style={{ padding: 24, color: '#fca5a5', fontSize: 14 }}>{fetchError}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>No stocks match your filters</p>
            <p style={{ fontSize: 13 }}>Try widening your criteria or click Reset</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {[
                  { key: 'symbol', label: 'Symbol' },
                  { key: 'name', label: 'Name' },
                  { key: 'price', label: 'Price' },
                  { key: 'change_pct', label: 'Change' },
                  { key: 'market_cap', label: 'Mkt Cap' },
                  { key: 'pe_ratio', label: 'P/E' },
                  { key: 'sector', label: 'Sector' },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const isPos = s.change_pct >= 0
                return (
                  <tr key={s.symbol} onClick={() => onSelectStock(s.symbol)}>
                    <td style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{s.symbol}</td>
                    <td style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</td>
                    <td style={{ fontWeight: 600 }}>{s.price != null ? `$${parseFloat(s.price).toFixed(2)}` : '—'}</td>
                    <td style={{ color: s.change_pct != null ? (isPos ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)', fontWeight: 600 }}>
                      {s.change_pct != null ? `${isPos ? '+' : ''}${parseFloat(s.change_pct).toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{fmt(s.market_cap, '$')}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.pe_ratio ? s.pe_ratio.toFixed(1) : '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.sector || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
