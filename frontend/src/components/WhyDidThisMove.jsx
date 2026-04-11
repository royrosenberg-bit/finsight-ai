import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000/api'

// Confidence config — color, glow, label
const CONF = {
  High:   { color: '#22c55e', glow: 'rgba(34,197,94,0.18)',   bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.22)',   dot: '#22c55e' },
  Medium: { color: '#f59e0b', glow: 'rgba(245,158,11,0.15)',  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.22)',  dot: '#f59e0b' },
  Low:    { color: '#64748b', glow: 'rgba(100,116,139,0.08)', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.18)', dot: '#64748b' },
}

// Animated pulse dot for "live" feel
function PulseDot({ color }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: color, opacity: 0.4,
        animation: 'ping 1.4s cubic-bezier(0,0,0.2,1) infinite',
      }} />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <style>{`@keyframes ping { 0%{transform:scale(1);opacity:0.4} 70%,100%{transform:scale(2.2);opacity:0} }`}</style>
    </span>
  )
}

// Shimmer loading skeleton
function LoadingSkeleton() {
  const Bar = ({ w, h = 13 }) => (
    <div className="skeleton" style={{ width: w, height: h, borderRadius: 6 }} />
  )
  return (
    <div style={{
      background: 'linear-gradient(160deg, #0d1022 0%, #0f1530 100%)',
      border: '1px solid var(--border)', borderRadius: 18,
      padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Bar w={180} h={15} />
            <Bar w={60} h={11} />
          </div>
        </div>
        <Bar w={110} h={26} style={{ borderRadius: 20 }} />
      </div>
      {/* Summary lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 14, borderLeft: '3px solid var(--border)' }}>
        <Bar w="92%" />
        <Bar w="78%" />
        <Bar w="55%" />
      </div>
      {/* Driver rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0 }} />
            <Bar w={`${55 + i * 10}%`} h={12} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function WhyDidThisMove({ symbol }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (!symbol) return
    setData(null)
    setLoading(true)
    axios.get(`${API}/whymove/${symbol}`)
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) return <LoadingSkeleton />
  if (!data) return null

  const isUp = (data.change_pct ?? 0) >= 0
  const moveColor = isUp ? '#22c55e' : '#ef4444'
  const conf = CONF[data.confidence] || CONF.Low
  const ts = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
    : null

  return (
    <div
      className="fade-in"
      style={{
        background: 'linear-gradient(160deg, #0d1022 0%, #0f1530 100%)',
        border: `1px solid ${conf.border}`,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: `0 0 32px ${conf.glow}`,
        transition: 'box-shadow 0.3s',
      }}
    >
      {/* ── Header ────────────────────────────────── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 26px', cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${conf.border}` : 'none',
          gap: 12,
        }}
      >
        {/* Left: icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: isUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
            filter: `drop-shadow(0 0 8px ${moveColor})`,
          }}>
            {isUp ? '↑' : '↓'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Why Did {data.symbol} Move?
              </span>
              <span style={{
                fontSize: 14, fontWeight: 800, color: moveColor,
                background: isUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                padding: '1px 8px', borderRadius: 6,
              }}>
                {isUp ? '+' : ''}{data.change_pct}%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <PulseDot color={conf.dot} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI-powered analysis</span>
              {ts && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {ts}</span>}
            </div>
          </div>
        </div>

        {/* Right: confidence + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: conf.bg, border: `1px solid ${conf.border}`,
            padding: '5px 12px', borderRadius: 20,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: conf.color, display: 'inline-block' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: conf.color, letterSpacing: '0.05em' }}>
              {data.confidence.toUpperCase()} CONFIDENCE
            </span>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            ▾
          </span>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Summary — hero text */}
          <div style={{
            borderLeft: `3px solid ${conf.color}`,
            paddingLeft: 16,
          }}>
            <p style={{
              fontSize: 15, fontWeight: 400, color: '#cbd5e1',
              lineHeight: 1.7, margin: 0, letterSpacing: '-0.01em',
            }}>
              {data.summary}
            </p>
          </div>

          {/* Key Drivers */}
          {data.drivers?.length > 0 && (
            <div>
              <p style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12,
              }}>
                Key Drivers
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.drivers.map((driver, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.045)',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.045)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 7,
                      background: conf.bg, border: `1px solid ${conf.border}`,
                      color: conf.color, fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, fontWeight: 500 }}>
                      {driver}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Headlines */}
          {data.related_news?.length > 0 && (
            <div>
              <p style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12,
              }}>
                Related Headlines
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {data.related_news.slice(0, 3).map((item, i) => {
                  const hasUrl = item.url?.startsWith('http')
                  return (
                    <a
                      key={i}
                      href={hasUrl ? item.url : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        textDecoration: 'none',
                        cursor: hasUrl ? 'pointer' : 'default',
                        pointerEvents: hasUrl ? 'auto' : 'none',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (hasUrl) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = conf.border } }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
                    >
                      {/* Publisher dot */}
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: conf.color, opacity: 0.6, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 13, color: '#94a3b8', fontWeight: 500,
                          lineHeight: 1.45, margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {item.title}
                        </p>
                        {item.publisher && (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                            {item.publisher}
                          </p>
                        )}
                      </div>
                      {hasUrl && (
                        <span style={{ fontSize: 14, color: conf.color, opacity: 0.7, flexShrink: 0 }}>↗</span>
                      )}
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer — confidence reason */}
          {data.confidence_reason && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                {data.confidence_reason}
              </span>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
