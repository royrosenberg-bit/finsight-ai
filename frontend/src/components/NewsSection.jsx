import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000/api'

function timeAgo(pubDate) {
  if (!pubDate) return ''
  const d = new Date(pubDate)
  if (isNaN(d)) {
    // maybe unix timestamp
    const ts = Number(pubDate)
    if (!isNaN(ts)) return timeAgo(new Date(ts * 1000).toISOString())
    return ''
  }
  const diff = Date.now() - d.getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NewsSection({ symbol }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setArticles([])
    setLoading(true)
    setError(null)
    axios.get(`${API}/news/${symbol}`)
      .then(res => setArticles(res.data.articles || []))
      .catch(() => setError('Could not load news'))
      .finally(() => setLoading(false))
  }, [symbol])

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '20px 24px',
    }}>
      <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Latest News
      </h2>

      {loading && <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading news...</p>}
      {error && <p style={{ color: '#fca5a5', fontSize: '14px' }}>{error}</p>}

      {!loading && articles.length === 0 && !error && (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No recent news found.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {articles.map((article, i) => {
          const hasUrl = article.url && article.url.startsWith('http')
          return (
            <a
              key={i}
              href={hasUrl ? article.url : undefined}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textDecoration: 'none',
                padding: '12px',
                borderRadius: '10px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                transition: 'background 0.15s',
                cursor: hasUrl ? 'pointer' : 'default',
                pointerEvents: hasUrl ? 'auto' : 'none',
              }}
              onMouseEnter={e => { if (hasUrl) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
              onMouseLeave={e => { if (hasUrl) e.currentTarget.style.background = 'var(--bg-primary)' }}
            >
              <p style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                lineHeight: 1.5,
                marginBottom: '6px',
              }}>
                {article.title}
                {hasUrl && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--accent-light)' }}>↗</span>}
              </p>
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                {article.publisher && <span>{article.publisher}</span>}
                {article.published_at && <span>· {timeAgo(article.published_at)}</span>}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
