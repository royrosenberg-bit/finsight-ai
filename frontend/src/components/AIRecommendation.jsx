import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

const VERDICT = {
  Buy:  { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  color: '#22c55e', label: 'BUY'  },
  Hold: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b', label: 'HOLD' },
  Sell: { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  color: '#ef4444', label: 'SELL' },
}

const CONF_COLOR = { High: '#22c55e', Medium: '#f59e0b', Low: '#94a3b8' }
const RISK_COLOR = { Low: '#22c55e',  Medium: '#f59e0b', High: '#ef4444' }

function fmtPct(v) {
  if (v == null) return null
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

export default function AIRecommendation({ symbol }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(() => {
    setData(null)
    setLoading(true)
    setError(null)
    axios.get(`${API}/recommend/${symbol}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.detail || 'AI analysis failed'))
      .finally(() => setLoading(false))
  }, [symbol])

  useEffect(() => { load() }, [load])

  const v = data ? (VERDICT[data.verdict] || VERDICT.Hold) : null

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>
          ✨ AI Analysis
        </h2>
        {!loading && (
          <button onClick={load} style={{
            padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
            fontWeight: 600,
          }}>↺ Refresh</button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'ping 1s infinite' }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analyzing {symbol} with Claude AI…</span>
          </div>
          {[80, 100, 60, 90].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 14, width: `${w}%`, borderRadius: 4 }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: '#fca5a5', marginBottom: 6 }}>⚠️ {error}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>The backend may be waking up. Try again in a few seconds.</p>
          </div>
          <button onClick={load} style={{
            width: '100%', padding: '10px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#6366f1,#818cf8)', color: 'white',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>✨ Try Again</button>
        </div>
      )}

      {/* Result */}
      {data && v && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Verdict + confidence row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              background: v.bg, border: `2px solid ${v.border}`, borderRadius: 12,
              padding: '8px 22px', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: v.color, letterSpacing: 1 }}>{v.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.confidence && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: `${CONF_COLOR[data.confidence]}18`,
                  color: CONF_COLOR[data.confidence],
                  border: `1px solid ${CONF_COLOR[data.confidence]}40`,
                }}>
                  {data.confidence} Confidence
                </span>
              )}
              {data.risk_level && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: `${RISK_COLOR[data.risk_level]}18`,
                  color: RISK_COLOR[data.risk_level],
                  border: `1px solid ${RISK_COLOR[data.risk_level]}40`,
                }}>
                  {data.risk_level} Risk
                </span>
              )}
            </div>
          </div>

          {/* Price target row */}
          {(data.price_target || data.analyst_target) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {data.price_target && (
                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', flex: 1, minWidth: 100 }}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>AI Price Target</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-light)' }}>${data.price_target.toFixed(2)}</p>
                  {data.upside_pct != null && (
                    <p style={{ fontSize: 11, fontWeight: 600, color: data.upside_pct >= 0 ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                      {fmtPct(data.upside_pct)} upside
                    </p>
                  )}
                </div>
              )}
              {data.analyst_target && (
                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', flex: 1, minWidth: 100 }}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                    Wall St. Consensus {data.analyst_count ? `(${data.analyst_count})` : ''}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>${data.analyst_target.toFixed(2)}</p>
                  {data.price && (
                    <p style={{ fontSize: 11, fontWeight: 600, color: ((data.analyst_target - data.price) / data.price * 100) >= 0 ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                      {fmtPct((data.analyst_target - data.price) / data.price * 100)} upside
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          {data.summary && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, borderLeft: '2px solid var(--accent)', paddingLeft: 12 }}>
              {data.summary}
            </p>
          )}

          {/* Bull case */}
          {data.bull_case?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Bull Case
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.bull_case.map((pt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: '#22c55e', fontSize: 12, marginTop: 1, flexShrink: 0 }}>▲</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bear case */}
          {data.bear_case?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Bear Case
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.bear_case.map((pt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: '#ef4444', fontSize: 12, marginTop: 1, flexShrink: 0 }}>▼</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key metric to watch */}
          {data.key_metric && (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-light)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Key Metric to Watch
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{data.key_metric}</p>
            </div>
          )}

          <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            For educational purposes only. Not financial advice. Powered by Claude AI.
          </p>
        </div>
      )}
    </div>
  )
}
