import { useState, useEffect } from 'react'
import axios from 'axios'
import { TableSkeleton } from '../components/Skeleton'

const API = 'http://localhost:8000/api'
const STORAGE_KEY = 'finsight_watchlist'

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}

function DaysBadge({ days }) {
  if (days < 0) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Past</span>
  if (days === 0) return <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '3px 8px', borderRadius: 20 }}>Today!</span>
  if (days <= 7)  return <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', background: 'var(--green-dim)', padding: '3px 8px', borderRadius: 20 }}>{days}d</span>
  if (days <= 30) return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)', background: 'var(--accent-dim)', padding: '3px 8px', borderRadius: 20 }}>{days}d</span>
  return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{days}d</span>
}

export default function Earnings({ onSelectStock }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const watchlist = getWatchlist()
    const symbols = watchlist.length > 0 ? watchlist.join(',') : ''
    axios.get(`${API}/earnings${symbols ? `?symbols=${symbols}` : ''}`)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const upcoming = data.filter(d => d.days_until >= 0)
  const past = data.filter(d => d.days_until < 0)

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700 }}>📅 Earnings Calendar</h2>

      {loading ? (
        <div className="card"><TableSkeleton rows={8} /></div>
      ) : (
        <>
          {/* Upcoming */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Upcoming Earnings ({upcoming.length})
              </h3>
            </div>
            {upcoming.length === 0 ? (
              <p style={{ padding: '20px', color: 'var(--text-muted)', fontSize: 14 }}>No upcoming earnings found.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Company</th>
                    <th>Earnings Date</th>
                    <th>Days Until</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map(item => (
                    <tr key={item.symbol} onClick={() => onSelectStock(item.symbol)}>
                      <td style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{item.symbol}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{item.name}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{item.earnings_date}</td>
                      <td><DaysBadge days={item.days_until} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Past */}
          {past.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Recent Earnings ({past.length})
                </h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Company</th>
                    <th>Earnings Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {past.slice(0, 5).map(item => (
                    <tr key={item.symbol} onClick={() => onSelectStock(item.symbol)}>
                      <td style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{item.symbol}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{item.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{item.earnings_date}</td>
                      <td><DaysBadge days={item.days_until} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
