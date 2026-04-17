import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

const STANCE_CONFIG = {
  Bullish:  { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  icon: '↑' },
  Neutral:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', icon: '→' },
  Bearish:  { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  icon: '↓' },
}

const VERDICT_CONFIG = {
  Buy:  { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  label: 'BUY' },
  Hold: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', label: 'HOLD' },
  Sell: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  label: 'SELL' },
}

const CONF_COLOR = { High: '#22c55e', Medium: '#f59e0b', Low: '#64748b' }

function LoadingSkeleton() {
  const Bar = ({ w, h = 13 }) => <div className="skeleton" style={{ width: w, height: h, borderRadius: 6 }} />
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: '28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Bar w={200} h={16} />
          <Bar w={120} h={11} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ background: 'var(--bg-primary)', borderRadius: 14, padding: '18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Bar w={80} h={14} />
              <Bar w={60} h={22} />
            </div>
            <Bar w="95%" h={12} />
            <Bar w="80%" h={12} />
            <Bar w="60%" h={12} />
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentCard({ agent }) {
  const stance = STANCE_CONFIG[agent.stance] || STANCE_CONFIG.Neutral
  const confColor = CONF_COLOR[agent.confidence] || '#64748b'

  return (
    <div style={{
      background: 'var(--bg-primary)', border: `1px solid ${stance.border}`,
      borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12,
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 16px ${stance.bg}`; e.currentTarget.style.borderColor = stance.color + '55' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = stance.border }}
    >
      {/* Agent header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{agent.icon}</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{agent.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agent.role}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: stance.bg, border: `1px solid ${stance.border}`, padding: '4px 10px', borderRadius: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: stance.color }}>{stance.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: stance.color, letterSpacing: '0.04em' }}>{agent.stance.toUpperCase()}</span>
          </div>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: confColor, fontWeight: 600 }}>{agent.confidence} confidence</span>
          </div>
        </div>
      </div>

      {/* Key point */}
      {agent.key_point && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: `${stance.color}10`, border: `1px solid ${stance.color}22` }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: stance.color, margin: 0, lineHeight: 1.4 }}>"{agent.key_point}"</p>
        </div>
      )}

      {/* Reasoning */}
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
        {agent.reasoning}
      </p>
    </div>
  )
}

function VoteBar({ breakdown }) {
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const segments = [
    { key: 'Bullish', color: '#22c55e' },
    { key: 'Neutral', color: '#f59e0b' },
    { key: 'Bearish', color: '#ef4444' },
  ].filter(s => breakdown[s.key] > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
        {segments.map(s => (
          <div key={s.key} style={{ flex: breakdown[s.key], background: s.color, borderRadius: 4, transition: 'flex 0.5s ease' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{breakdown[s.key]} {s.key}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AIDebate({ symbol }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(true)

  function load() {
    if (!symbol) return
    setData(null)
    setError(null)
    setLoading(true)
    axios.get(`${API}/debate/${symbol}`)
      .then(res => setData(res.data))
      .catch(e => setError(e.response?.data?.detail || 'Could not load debate'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [symbol])

  if (loading) return <LoadingSkeleton />

  if (error) return (
    <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 18, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13, color: '#fca5a5' }}>⚠️ {error}</span>
      <button onClick={load} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#fca5a5', fontSize: 12, cursor: 'pointer' }}>Retry</button>
    </div>
  )

  if (!data || !data.agents?.length) return null

  const verdict = VERDICT_CONFIG[data.verdict] || VERDICT_CONFIG.Hold
  const ts = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
    : null

  return (
    <div className="fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 26px', cursor: 'pointer', borderBottom: expanded ? '1px solid var(--border)' : 'none', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            ⚖️
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>AI Analyst Debate</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>4 perspectives on {data.symbol}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Simulated debate · {ts && `Updated ${ts}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ background: verdict.bg, border: `1px solid ${verdict.border}`, padding: '6px 16px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: verdict.color, letterSpacing: '0.06em' }}>{verdict.label}</span>
            <span style={{ fontSize: 11, color: verdict.color, opacity: 0.7 }}>consensus</span>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        </div>
      </div>

      {/* ── Body ── */}
      {expanded && (
        <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Vote breakdown */}
          {data.vote_breakdown && Object.keys(data.vote_breakdown).length > 0 && (
            <div style={{ padding: '16px 20px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Vote Breakdown</span>
                <div style={{ background: verdict.bg, border: `1px solid ${verdict.border}`, padding: '4px 12px', borderRadius: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: verdict.color }}>{verdict.label}</span>
                </div>
              </div>
              <VoteBar breakdown={data.vote_breakdown} />
            </div>
          )}

          {/* Agent cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {data.agents.map((agent, i) => (
              <AgentCard key={i} agent={agent} />
            ))}
          </div>

          {/* Why agents disagree */}
          {(data.disagreement || data.consensus_note) && (
            <div style={{ display: 'grid', gridTemplateColumns: data.disagreement && data.consensus_note ? '1fr 1fr' : '1fr', gap: 12 }}>
              {data.disagreement && (
                <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Core Disagreement</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{data.disagreement}</p>
                </div>
              )}
              {data.consensus_note && (
                <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-light)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Where They Agree</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{data.consensus_note}</p>
                </div>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 12, margin: 0 }}>
            AI-generated perspectives for educational purposes only. Not financial advice.
          </p>
        </div>
      )}
    </div>
  )
}
