import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000/api'
const STORAGE_KEY = 'finsight_watchlist'

function useWatchlist() {
  const [list, setList] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
  })
  const save = (items) => { setList(items); localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) }
  const add = (sym) => { if (!list.includes(sym)) save([...list, sym]) }
  const remove = (sym) => save(list.filter(s => s !== sym))
  return { list, add, remove }
}

function WatchlistRow({ symbol, onRemove, onSelect }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    axios.get(`${API}/stock/${symbol}`)
      .then(res => setData(res.data))
      .catch(() => {})
  }, [symbol])

  const isPositive = data?.change_pct >= 0
  const color = isPositive ? 'var(--green)' : 'var(--red)'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px',
      borderRadius: '10px',
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      cursor: 'pointer',
      transition: 'background 0.15s',
    }}
      onClick={() => onSelect(symbol)}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-primary)'}
    >
      <div>
        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent-light)' }}>{symbol}</span>
        {data && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{data.name}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {data && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>${data.price}</div>
            <div style={{ fontSize: '12px', color }}>{data.change_pct > 0 ? '+' : ''}{data.change_pct}%</div>
          </div>
        )}
        <button
          onClick={e => { e.stopPropagation(); onRemove(symbol) }}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '16px', padding: '4px',
          }}
          title="Remove"
        >✕</button>
      </div>
    </div>
  )
}

export default function Watchlist({ onSelectStock }) {
  const { list, add, remove } = useWatchlist()
  const [input, setInput] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    const sym = input.trim().toUpperCase()
    if (sym) { add(sym); setInput('') }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-primary)' }}>
        ⭐ Watchlist
      </h2>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Add symbol (e.g. AAPL)"
          style={{
            flex: 1, padding: '12px 16px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <button type="submit" style={{
          padding: '12px 20px', borderRadius: '10px', border: 'none',
          background: 'var(--accent)', color: 'white', fontWeight: 600, cursor: 'pointer',
        }}>
          Add
        </button>
      </form>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '14px' }}>
          No stocks in your watchlist yet. Add one above!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {list.map(sym => (
            <WatchlistRow key={sym} symbol={sym} onRemove={remove} onSelect={onSelectStock} />
          ))}
        </div>
      )}
    </div>
  )
}

export { useWatchlist }
