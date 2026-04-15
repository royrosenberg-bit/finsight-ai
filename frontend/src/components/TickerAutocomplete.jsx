/**
 * Reusable ticker autocomplete input.
 * Used on Compare, Watchlist, Portfolio, and any other page with a ticker field.
 *
 * Props:
 *   value        – controlled input string
 *   onChange     – called with raw string as user types
 *   onSelect     – called with uppercase symbol when user picks from dropdown or submits
 *   placeholder  – input placeholder
 *   disabled     – disables the input
 *   error        – if truthy, shows red border
 *   inputStyle   – extra styles merged onto the <input>
 */

import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

export default function TickerAutocomplete({
  value, onChange, onSelect,
  placeholder = 'Symbol (e.g. AAPL)',
  disabled = false,
  error = false,
  inputStyle = {},
}) {
  const [suggestions, setSuggestions] = useState([])
  const [show,        setShow]        = useState(false)
  const [activeIdx,   setActiveIdx]   = useState(-1)
  const debounceRef  = useRef(null)
  const containerRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    function onDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShow(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function handleChange(e) {
    const val = e.target.value
    onChange(val)
    setActiveIdx(-1)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setSuggestions([]); setShow(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/search?q=${encodeURIComponent(val.trim())}`)
        setSuggestions(data)
        setShow(data.length > 0)
      } catch {
        setSuggestions([])
        setShow(false)
      }
    }, 220)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      if (show && activeIdx >= 0) {
        e.preventDefault()
        pick(suggestions[activeIdx].symbol)
      } else {
        // Let the parent form's onSubmit handle it — just close dropdown
        setShow(false)
      }
    } else if (e.key === 'Escape') {
      setShow(false)
    }
  }

  function pick(sym) {
    onChange(sym)
    setSuggestions([])
    setShow(false)
    setActiveIdx(-1)
    onSelect(sym.toUpperCase())
  }

  const borderColor = error ? 'rgba(239,68,68,0.5)' : show ? 'var(--accent)' : 'var(--border)'

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setShow(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 10,
          border: `1px solid ${borderColor}`,
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: 14,
          outline: 'none',
          transition: 'border-color 0.15s',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />

      {show && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, zIndex: 300, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.symbol}
              onMouseDown={() => pick(s.symbol)}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(-1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer',
                background: i === activeIdx ? 'var(--bg-card-hover)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s',
              }}
            >
              <span style={{
                background: 'var(--accent-dim)', color: 'var(--accent-light)',
                padding: '2px 8px', borderRadius: 6, fontSize: 12,
                fontWeight: 700, minWidth: 48, textAlign: 'center', flexShrink: 0,
              }}>{s.symbol}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {s.type === 'ETF' ? 'ETF' : s.exchange}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
