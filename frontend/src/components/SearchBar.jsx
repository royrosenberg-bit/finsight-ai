import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

export default function SearchBar({ onSearch, loading }) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleChange(e) {
    const val = e.target.value
    setInput(val)
    setActiveSuggestion(-1)

    clearTimeout(debounceRef.current)
    if (val.trim().length < 1) { setSuggestions([]); setShowDropdown(false); return }

    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/search?q=${encodeURIComponent(val.trim())}`)
        setSuggestions(data)
        setShowDropdown(data.length > 0)
      } catch {
        setSuggestions([])
        setShowDropdown(false)
      }
    }, 250)
  }

  function handleSelect(sym) {
    setInput(sym)
    setShowDropdown(false)
    setSuggestions([])
    onSearch(sym)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const sym = input.trim().toUpperCase()
    if (sym) {
      setShowDropdown(false)
      onSearch(sym)
    }
  }

  function handleKeyDown(e) {
    if (!showDropdown || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeSuggestion].symbol)
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', fontSize: '16px', pointerEvents: 'none',
          }}>🔍</span>
          <input
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="Search stock symbol or name..."
            disabled={loading}
            autoComplete="off"
            style={{
              width: '100%', padding: '13px 16px 13px 40px',
              borderRadius: '12px', border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: '15px', outline: 'none', transition: 'border-color 0.2s',
            }}
            onMouseOver={e => e.target.style.borderColor = 'var(--border-light)'}
            onMouseOut={e => e.target.style.borderColor = showDropdown ? 'var(--accent)' : 'var(--border)'}
            ref={el => { if (el) el.style.borderColor = showDropdown ? 'var(--accent)' : 'var(--border)' }}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '13px 24px', borderRadius: '12px', border: 'none',
            background: loading || !input.trim() ? 'var(--bg-card-hover)' : 'var(--accent)',
            color: loading || !input.trim() ? 'var(--text-muted)' : 'white',
            fontSize: '14px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s', whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Loading…' : 'Analyze'}
        </button>
      </form>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', zIndex: 100, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.symbol}
              onMouseDown={() => handleSelect(s.symbol)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '11px 16px', cursor: 'pointer',
                background: i === activeSuggestion ? 'var(--bg-card-hover)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = i === activeSuggestion ? 'var(--bg-card-hover)' : 'transparent'}
            >
              <span style={{
                background: 'var(--accent-dim)', color: 'var(--accent-light)',
                padding: '3px 8px', borderRadius: '6px', fontSize: '12px',
                fontWeight: 700, minWidth: '52px', textAlign: 'center',
              }}>
                {s.symbol}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {s.type === 'ETF' ? 'ETF' : s.exchange}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
