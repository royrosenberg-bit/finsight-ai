import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000/api'
const STORAGE_KEY = 'finsight_watchlist'

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', label: 'Critical', dot: '#ef4444' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)', label: 'High',     dot: '#f97316' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)',  label: 'Medium',   dot: '#f59e0b' },
  low:      { color: '#6366f1', bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.2)',  label: 'Low',      dot: '#6366f1' },
}

const TYPE_ICONS = {
  unusual_move:   '📈',
  unusual_volume: '📊',
  earnings_soon:  '📅',
  milestone:      '🏆',
}

const TYPE_LABELS = {
  unusual_move:   'Price Move',
  unusual_volume: 'Volume Spike',
  earnings_soon:  'Earnings',
  milestone:      'Milestone',
}

function AlertCard({ alert, read, onToggleRead }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium
  const timeAgo = (() => {
    try {
      const diff = (Date.now() - new Date(alert.timestamp)) / 1000
      if (diff < 60) return 'just now'
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
      return `${Math.floor(diff / 3600)}h ago`
    } catch { return '' }
  })()

  return (
    <div
      onClick={() => onToggleRead(alert.id)}
      style={{
        background: read ? 'var(--bg-card)' : cfg.bg,
        border: `1px solid ${read ? 'var(--border)' : cfg.border}`,
        borderRadius: 14, padding: '16px 18px',
        cursor: 'pointer', transition: 'all 0.15s',
        opacity: read ? 0.65 : 1,
        display: 'flex', gap: 14, alignItems: 'flex-start',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = 1}
      onMouseLeave={e => e.currentTarget.style.opacity = read ? 0.65 : 1}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>
        {TYPE_ICONS[alert.type] || '🔔'}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontWeight: 700, fontSize: 13, color: 'var(--accent-light)',
              background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 6,
            }}>{alert.symbol}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
              background: `${cfg.color}18`, color: cfg.color,
            }}>{cfg.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{TYPE_LABELS[alert.type] || alert.type}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo}</span>
            {!read && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: cfg.dot, display: 'inline-block',
                boxShadow: `0 0 6px ${cfg.dot}`,
              }} />
            )}
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          {alert.message}
        </p>
      </div>
    </div>
  )
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [readIds, setReadIds] = useState(new Set())
  const [filterType, setFilterType] = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')

  const watchlist = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
  })()

  async function fetchAlerts() {
    setLoading(true)
    try {
      const params = watchlist.length > 0 ? `?symbols=${watchlist.join(',')}` : ''
      const res = await axios.get(`${API}/alerts${params}`)
      setAlerts(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAlerts() }, [])

  function toggleRead(id) {
    setReadIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function markAllRead() {
    setReadIds(new Set(alerts.map(a => a.id)))
  }

  const filtered = alerts.filter(a => {
    if (filterType !== 'all' && a.type !== filterType) return false
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false
    return true
  })

  const unreadCount = alerts.filter(a => !readIds.has(a.id)).length

  const types = [...new Set(alerts.map(a => a.type))]

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>🔔 Smart Alerts</h2>
          {unreadCount > 0 && (
            <span style={{
              background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700,
              padding: '2px 8px', borderRadius: 20,
            }}>{unreadCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{
              padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            }}>Mark all read</button>
          )}
          <button onClick={fetchAlerts} style={{
            padding: '8px 16px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>↻ Refresh</button>
        </div>
      </div>

      {/* Info about watchlist */}
      {watchlist.length > 0 && (
        <div style={{
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-muted)',
        }}>
          Monitoring your watchlist ({watchlist.join(', ')}) + popular stocks
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', ...types].map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, cursor: 'pointer',
              background: filterType === t ? 'var(--accent)' : 'var(--bg-card)',
              color: filterType === t ? 'white' : 'var(--text-muted)',
              fontWeight: filterType === t ? 600 : 400,
              border: '1px solid var(--border)',
            }}>
              {t === 'all' ? 'All Types' : (TYPE_LABELS[t] || t)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {['all', 'critical', 'high', 'medium'].map(s => (
            <button key={s} onClick={() => setFilterSeverity(s)} style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer',
              background: filterSeverity === s ? (SEVERITY_CONFIG[s]?.color || 'var(--accent)') : 'var(--bg-card)',
              color: filterSeverity === s ? 'white' : 'var(--text-muted)',
              fontWeight: filterSeverity === s ? 700 : 400,
            }}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 6 }}>No alerts match your filters</p>
          <p style={{ fontSize: 13 }}>Markets are quiet, or try adjusting filters</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              read={readIds.has(alert.id)}
              onToggleRead={toggleRead}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
          Click an alert to mark it as read • Showing {filtered.length} of {alerts.length} alerts
        </p>
      )}
    </div>
  )
}
